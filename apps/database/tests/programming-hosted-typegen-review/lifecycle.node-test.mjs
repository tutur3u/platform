import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  assertFirewallPolicy,
  assertNetworkPolicy,
  firewallRules,
  networkPolicy,
} from './network-policy.mjs';
import { runOwnedProcess } from './process-group.mjs';
import {
  cleanupRecordedProject,
  limits,
  resumeRecordedProject,
  stageAndRecord,
} from './proposal.mjs';

const metadata = {
  projectId: 'tt-synthetic',
  disposableRoot: '/synthetic-owned-root',
  repositoryRoot: process.cwd(),
  headSha: 'a'.repeat(40),
  basePort: 27000,
  typegenOutput: 'packages/types/src/supabase.ts',
};
test('ownership is recorded immediately after staging, before subsequent work', async () => {
  const events = [];
  const state = await stageAndRecord(
    {},
    { marker: true },
    {
      stage: async () => {
        events.push('stage');
        return metadata;
      },
      record: (saved) => {
        events.push('record');
        assert.equal(saved.metadata, metadata);
      },
      remove: async () =>
        assert.fail('successful staging must remain recorded'),
    }
  );
  assert.deepEqual(events, ['stage', 'record']);
  assert.equal(state.metadata, metadata);
});
test('failed ownership write removes exactly the staged root', async () => {
  const removed = [];
  await assert.rejects(
    stageAndRecord(
      {},
      {},
      {
        stage: async () => metadata,
        record: () => {
          throw new Error('synthetic write failure');
        },
        remove: async (root) => removed.push(root),
      }
    ),
    /synthetic write failure/
  );
  assert.deepEqual(removed, [metadata.disposableRoot]);
});
test('resume checks actual validator and passes only recorded root to helper', async () => {
  const calls = [];
  const diagnostics = [];
  const onDiagnostic = (kind) => diagnostics.push(kind);
  await resumeRecordedProject(
    { metadata },
    {
      read: async () => metadata,
      onDiagnostic,
      runner: async (binary, args, options) => {
        calls.push({ binary, args, options });
        options.onDiagnostic?.('database');
      },
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].binary, process.execPath);
  assert.deepEqual(calls[0].args.slice(1), [
    '--resume',
    metadata.disposableRoot,
  ]);
  assert.equal(calls[0].options.timeoutMs, limits.executionMs);
  assert.equal(calls[0].options.onDiagnostic, onDiagnostic);
  assert.deepEqual(diagnostics, ['database']);
  await assert.rejects(
    resumeRecordedProject(
      { metadata },
      {
        read: async () => ({
          ...metadata,
          typegenOutput: path.resolve(metadata.typegenOutput),
        }),
        runner: async () =>
          assert.fail('invalid metadata must not launch helper'),
      }
    ),
    /must be exactly/
  );
});
test('cleanup uses bounded helper group and preserves unrelated identities', async () => {
  let exists = true;
  let saved;
  const calls = [];
  await cleanupRecordedProject(
    { metadata },
    {
      exists: () => exists,
      read: async () => metadata,
      runner: async (binary, args, options) => {
        calls.push({ binary, args, options });
        exists = false;
      },
      inventory: () => ['supabase_db_tt-other', 'unrelated'],
      portAvailable: async () => true,
      record: (state) => {
        saved = state;
      },
    }
  );
  assert.equal(calls[0].binary, process.execPath);
  assert.deepEqual(calls[0].args.slice(1), [
    '--cleanup',
    metadata.disposableRoot,
  ]);
  assert.equal(calls[0].options.timeoutMs, limits.cleanupMs);
  assert.equal(saved.cleanupVerified, true);
});
test('cleanup rejects changed identity before launching a subprocess', async () => {
  await assert.rejects(
    cleanupRecordedProject(
      { metadata },
      {
        exists: () => true,
        read: async () => ({ ...metadata, projectId: 'tt-other' }),
        runner: async () =>
          assert.fail('changed identity must not launch helper'),
      }
    ),
    /identity changed/
  );
});
test('cleanup failure or remaining resource cannot become verified', async () => {
  for (const mode of ['interrupted', 'container', 'network', 'port']) {
    const state = { metadata, cleanupVerified: false };
    await assert.rejects(
      cleanupRecordedProject(state, {
        exists: () => mode === 'interrupted',
        read: async () => metadata,
        runner: async () => {
          throw new Error('synthetic interruption');
        },
        inventory: (kind) =>
          mode === kind ? ['supabase_owned_tt-synthetic'] : [],
        portAvailable: async () => mode !== 'port',
        record: () => assert.fail('failed cleanup must not record success'),
      })
    );
    assert.equal(state.cleanupVerified, false);
  }
});
const policyFixture = () => ({
  daemon: {
    'cgroup-parent': networkPolicy.slice,
    'default-address-pools': [{ base: networkPolicy.containerPool, size: 24 }],
    dns: networkPolicy.dns,
    ipv6: false,
  },
  programs: [
    { attach_type: 'cgroup_inet_ingress' },
    { attach_type: 'cgroup_inet_egress' },
  ],
  allow: '127.0.0.0/8 ::1/128 172.28.0.0/16',
  deny: '0.0.0.0/0 ::/0',
});
test('network preflight fails closed on missing filters, public DNS or broad allow', () => {
  assert.doesNotThrow(() => assertNetworkPolicy(policyFixture()));
  for (const change of [
    (policy) => {
      policy.programs = [];
    },
    (policy) => {
      policy.daemon.dns = ['8.8.8.8'];
    },
    (policy) => {
      policy.allow += ' 0.0.0.0/0';
    },
    (policy) => {
      policy.deny = '';
    },
    (policy) => {
      policy.daemon['cgroup-parent'] = 'system.slice';
    },
  ]) {
    const policy = policyFixture();
    change(policy);
    assert.throws(() => assertNetworkPolicy(policy));
  }
});
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
async function assertProcessesGone(pids) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (pids.every((pid) => !alive(pid))) return;
    await delay(20);
  }
  assert.deepEqual(
    pids.filter(alive),
    [],
    'owned fake subprocess descendants remain'
  );
}
for (const mode of ['timeout', 'interruption', 'monitor']) {
  test(`owned process group kills fake helper and fake CLI on ${mode}`, async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'typegen-process-contract-')
    );
    const marker = path.join(root, 'pids.json');
    const fixture = path.join(root, 'fake-helper.mjs');
    const signals = new EventEmitter();
    let pids;
    try {
      await writeFile(
        fixture,
        `
        import { spawn } from 'node:child_process';
        import { writeFileSync } from 'node:fs';
        const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { stdio:'ignore' });
        child.once('spawn',()=>writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid])));
        process.on('SIGTERM',()=>{});
        setInterval(()=>{},1000);
      `
      );
      await assert.rejects(
        runOwnedProcess(process.execPath, [fixture, marker], {
          timeoutMs: mode === 'timeout' ? 2500 : 3000,
          intervalMs: 20,
          signalSource: signals,
          onTick: () => {
            if (existsSync(marker)) {
              if (mode === 'interruption') signals.emit('SIGTERM');
              if (mode === 'monitor')
                throw new Error('synthetic resource violation');
            }
          },
        }),
        mode === 'timeout'
          ? /time budget exceeded/
          : mode === 'monitor'
            ? /resource violation/
            : /interrupted/
      );
      pids = JSON.parse(await readFile(marker, 'utf8'));
      await assertProcessesGone(pids);
    } finally {
      if (pids)
        for (const pid of pids) if (alive(pid)) process.kill(pid, 'SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('bridge policy rejects missing drop rules or an earlier accept', () => {
  const policy = {
    rules: firewallRules.join('\n'),
    dockerUser:
      '-N DOCKER-USER\n-A DOCKER-USER -j TTR-TYPEGEN-EGRESS\n-A DOCKER-USER -j RETURN',
    forward: '-P FORWARD DROP\n-A FORWARD -j TTR-TYPEGEN-EGRESS',
  };
  assert.doesNotThrow(() => assertFirewallPolicy(policy));
  assert.throws(() =>
    assertFirewallPolicy({
      ...policy,
      rules: policy.rules.replace('-i br+ -j DROP', '-i br+ -j ACCEPT'),
    })
  );
  assert.throws(() =>
    assertFirewallPolicy({
      ...policy,
      dockerUser: `-A DOCKER-USER -j ACCEPT\n${policy.dockerUser}`,
    })
  );
  assert.throws(() =>
    assertFirewallPolicy({
      ...policy,
      forward: `-A FORWARD -j ACCEPT\n${policy.forward}`,
    })
  );
});

test('owned process startup diagnostics expose only fixed kinds from bounded stderr', async () => {
  const observed = [];
  await runOwnedProcess(
    process.execPath,
    [
      '-e',
      'process.stderr.write("private-fixture " + "x".repeat(5000) + " failed to pull image: secret-fixture-token\\nFATAL: private database text\\n");',
    ],
    {
      timeoutMs: 5000,
      onDiagnostic: (kind) => observed.push(kind),
    }
  );
  assert.deepEqual(observed, ['image-pull', 'database']);
});

test('diagnostic drain is bounded when an escaped fixture retains stderr', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'typegen-stderr-contract-')
  );
  const marker = path.join(root, 'escaped-pid');
  const observed = [];
  let escapedPid;
  try {
    const started = Date.now();
    await runOwnedProcess(
      process.execPath,
      [
        '-e',
        `
      const { spawn } = require('node:child_process');
      const { writeFileSync } = require('node:fs');
      const holder = spawn(process.execPath, ['-e',
        'setTimeout(() => process.stderr.write("FATAL: synthetic late diagnostic"), 80); setInterval(() => {}, 1000)'
      ], {
        detached: true, stdio: ['ignore', 'ignore', process.stderr],
      });
      holder.once('spawn', () => {
        writeFileSync(process.argv[1], String(holder.pid));
        holder.unref();
      });
    `,
        marker,
      ],
      {
        timeoutMs: 5000,
        onDiagnostic: (kind) => observed.push(kind),
      }
    );
    escapedPid = Number(await readFile(marker, 'utf8'));
    assert.ok(alive(escapedPid), 'fixture must keep the stderr pipe open');
    assert.ok(
      Date.now() - started < 2000,
      'diagnostic draining must stay bounded'
    );
    assert.deepEqual(observed, ['database']);
  } finally {
    if (!escapedPid && existsSync(marker))
      escapedPid = Number(await readFile(marker, 'utf8'));
    if (escapedPid && alive(escapedPid)) process.kill(escapedPid, 'SIGKILL');
    await rm(root, { recursive: true, force: true });
  }
});
