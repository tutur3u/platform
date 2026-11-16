import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { syntheticCopy } from './fleet-qa-test-copy.mjs';
import { installSyntheticSdk } from './fleet-qa-sdk-fixture.mjs';
import { ids, wsids, clock } from './fleet-qa-fixture.mjs';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SECRET_KEY: 'synthetic-service-credential',
};
const sharedId = '40000000-0000-4000-8000-000000000004';

async function prepareCleanup(copy, settings) {
  const module = await copy.import();
  const r = module.newReceipt(
    { ack: module.EXEC_ACK, projectRef: 'abcdefghijklmnopqrst' },
    clock(),
    3600
  );
  for (const [i, account] of r.accounts.entries()) {
    account.id = ids[i];
    account.outcome = i === 0 ? 'login-failed' : 'ready';
    account.workspaces = [{ id: wsids[i], creatorId: ids[i], personal: true }];
  }
  r.sharedRecords.push({ label: 'a1', id: sharedId, name: 'QA D241' });
  const fixture = await installSyntheticSdk(copy, settings);
  await writeFile(fixture.receipt, JSON.stringify(r), { mode: 0o600 });
  await copy.writeAck(copy.ack(module.CLEAN_ACK));
  return { ...fixture, module };
}

function run(copy, receipt, phase) {
  return spawnSync(
    process.execPath,
    [copy.path, '--custody-directory', copy.dir, receipt, phase],
    {
      env,
      encoding: 'utf8',
      timeout: 8000,
    }
  );
}

test('direct main cleanup uses the guarded transport and respects both deletion-trigger outcomes', async () => {
  for (const cascadePersonal of [false, true]) {
    const copy = await syntheticCopy();
    try {
      const fixture = await prepareCleanup(copy, { cascadePersonal });
      const result = run(copy, fixture.receipt, 'cleanup');
      assert.equal(result.status, 0, result.stderr);
      const trace = JSON.parse(await readFile(fixture.trace, 'utf8'));
      assert.ok(trace.fetches.length > 0);
      assert.equal(
        trace.fetches.every((f) => f.origin === env.NEXT_PUBLIC_SUPABASE_URL),
        true
      );
      assert.equal(
        trace.calls.some((c) => ['link', 'verify', 'signout'].includes(c[0])),
        false
      );
      const shared = trace.calls.findIndex(
        (c) =>
          c[0] === 'table' &&
          c[1] === 'workspaces' &&
          c[2] === 'delete' &&
          c[3].some(([key, value]) => key === 'id' && value === sharedId)
      );
      const firstUserDelete = trace.calls.findIndex((c) => c[0] === 'delete');
      assert.ok(shared >= 0 && shared < firstUserDelete);
      assert.ok(
        trace.calls.findIndex((c) => c[0] === 'get' && c[1] === ids[1]) < shared
      );
      for (const [index, id] of ids.entries()) {
        const userDelete = trace.calls.findIndex(
          (c) => c[0] === 'delete' && c[1] === id
        );
        const personal = trace.calls.findIndex(
          (c) =>
            c[0] === 'table' &&
            c[1] === 'workspaces' &&
            c[2] === 'delete' &&
            c[3].some(([key, value]) => key === 'id' && value === wsids[index])
        );
        if (cascadePersonal) assert.equal(personal, -1);
        else assert.ok(personal > userDelete);
      }
      for (const c of trace.calls.filter(
        (c) => c[0] === 'table' && c[2] === 'delete'
      )) {
        assert.equal(c[1], 'workspaces');
        assert.equal(c[3].length, 2);
        assert.deepEqual(
          c[3].map(([field]) => field),
          ['id', 'creator_id']
        );
      }
      assert.equal(trace.remainingUsers, 0);
      assert.equal(trace.remainingWorkspaces, 0);
      assert.equal(trace.remainingMembers, 0);
      const r = JSON.parse(await readFile(fixture.receipt, 'utf8'));
      assert.equal(
        r.accounts.every(
          (a) =>
            a.outcome === 'deleted' &&
            a.sessionRevocation === 'auth-delete-cascade' &&
            a.accessJwtResidual === 'access-jwt-valid-until-exp'
        ),
        true
      );
      assert.equal(JSON.stringify(r).includes(env.SUPABASE_SECRET_KEY), false);
      await assert.rejects(stat(`${fixture.receipt}.lock`), { code: 'ENOENT' });
    } finally {
      await copy.close();
    }
  }
});

test('main denies altered shared-workspace creator, type, name or creation time before a delete', async () => {
  for (const sharedOverride of [
    { creator_id: ids[1] },
    { personal: true },
    { name: 'unlabelled' },
    { created_at: '2020-01-01T00:00:00Z' },
    { created_at: '2099-01-01T00:00:00Z' },
  ]) {
    const copy = await syntheticCopy();
    try {
      const fixture = await prepareCleanup(copy, { sharedOverride });
      const result = run(copy, fixture.receipt, 'cleanup');
      assert.equal(result.status, 1);
      const trace = JSON.parse(await readFile(fixture.trace, 'utf8'));
      assert.equal(
        trace.calls.some(
          (c) => c[0] === 'delete' || (c[0] === 'table' && c[2] === 'delete')
        ),
        false
      );
    } finally {
      await copy.close();
    }
  }
});

test('main guarded fetch stops a foreign SDK destination before its transport runs', async () => {
  const copy = await syntheticCopy();
  try {
    const fixture = await prepareCleanup(copy, { wrongOrigin: true });
    const result = run(copy, fixture.receipt, 'cleanup');
    assert.equal(result.status, 1);
    const trace = JSON.parse(await readFile(fixture.trace, 'utf8'));
    assert.deepEqual(trace.fetches, []);
    assert.equal(
      trace.calls.some((c) => c[0] === 'delete'),
      false
    );
  } finally {
    await copy.close();
  }
});

test('SIGTERM closes both synthetic handoff listeners, records stopped logins and releases the receipt lock', async () => {
  const copy = await syntheticCopy();
  let child;
  try {
    const fixture = await installSyntheticSdk(copy);
    await copy.writeAck(copy.ack());
    child = spawn(
      process.execPath,
      [
        copy.path,
        '--custody-directory',
        copy.dir,
        fixture.receipt,
        'execution',
      ],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let output = '';
    let error = '';
    child.stderr.on('data', (bytes) => {
      error += bytes;
    });
    const closed = once(child, 'close');
    const ready = new Promise((yes, no) => {
      const timer = setTimeout(
        () => no(new Error('Synthetic listeners did not become ready')),
        5000
      );
      child.stdout.on('data', (bytes) => {
        output += bytes;
        const lines = output.trim().split('\n').filter(Boolean);
        if (lines.length === 2) {
          clearTimeout(timer);
          yes(lines.map((line) => JSON.parse(line)));
        }
      });
      closed.then(() => {
        clearTimeout(timer);
        no(new Error(`Synthetic child exited before readiness: ${error}`));
      });
    });
    const sessions = await ready;
    child.kill('SIGTERM');
    const [code] = await closed;
    assert.equal(code, 1);
    const r = JSON.parse(await readFile(fixture.receipt, 'utf8'));
    assert.equal(
      r.accounts.every(
        (a) => a.outcome === 'login-failed' && a.loginOutcome === 'stopped'
      ),
      true
    );
    await assert.rejects(stat(`${fixture.receipt}.lock`), { code: 'ENOENT' });
    for (const session of sessions) {
      assert.equal(typeof session.port, 'number');
      await new Promise((yes, no) => {
        const socket = connect(session.port, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          no(new Error('Listener remained open'));
        });
        socket.once('error', yes);
      });
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'close');
    }
    await copy.close();
  }
});
