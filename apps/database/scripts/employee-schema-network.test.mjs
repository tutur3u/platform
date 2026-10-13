import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import './employee-schema-observer-shutdown.test.mjs';
import {
  createEmployeeNetwork,
  createNetworkEventProof,
  networkCoverageProof,
  removeEmployeeNetwork,
  startEmployeeNetworkObserver,
  validateEmployeeNetwork,
  verifyEmployeeNetwork,
} from './employee-schema-network.mjs';

const sourceSha = 'a'.repeat(40),
  controlSha = 'b'.repeat(40);
const metadata = { projectId: 'tt-source-aaaaaaaa-0123456789' };
const network = {
  id: 'd'.repeat(64),
  name: 'tt-employee-net-123-1',
  labels: Object.fromEntries(
    ['source', 'control', 'run', 'attempt', 'nonce', 'project'].map((key) => [
      `ttr.employee.${key}`,
      key,
    ])
  ),
};
const networkActual = {
  Id: network.id,
  Name: network.name,
  Internal: true,
  Driver: 'bridge',
  Labels: network.labels,
};
function fixture(t) {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'employee-network-test-')
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test('only the exact internal bridge and all creator labels are accepted', () => {
  assert.deepEqual(validateEmployeeNetwork(networkActual, network), network);
  for (const delta of [
    { Internal: false },
    { Id: 'e'.repeat(64) },
    { Driver: 'host' },
    { Labels: {} },
    { Name: 'foreign' },
    { Labels: { ...network.labels, 'com.supabase.cli.project': 'foreign' } },
  ]) {
    assert.throws(() =>
      validateEmployeeNetwork({ ...networkActual, ...delta }, network)
    );
  }
});
test('missing network inspect fails closed and never invokes network creation', async () => {
  const calls = [];
  await assert.rejects(
    verifyEmployeeNetwork(network, async (_command, args) => {
      calls.push(args);
      throw new Error('private diagnostic');
    })
  );
  assert.deepEqual(calls, [['network', 'inspect', network.id]]);
});
function event(type, action, id, attrs = {}) {
  return JSON.stringify({
    Type: type,
    Action: action,
    Actor: { ID: id, Attributes: attrs },
  });
}
const containerId = 'f'.repeat(64);
const attrs = {
  'com.supabase.cli.project': metadata.projectId,
  image: 'ghcr.io/supabase/postgres-meta:v0.95.1',
};
test('transient pgmeta create/connect/start/destroy remains in exact network evidence after removal', () => {
  const proof = createNetworkEventProof(metadata.projectId, network.id);
  proof.accept(event('container', 'create', containerId, attrs));
  proof.accept(
    event('network', 'connect', network.id, { container: containerId })
  );
  proof.accept(event('container', 'start', containerId, attrs));
  proof.accept(event('container', 'destroy', containerId, attrs));
  assert.deepEqual(proof.result(), {
    qualified: true,
    networkId: network.id,
    containerIds: [containerId],
    images: [attrs.image],
  });
});
test('absent create/attachment, extra network and later foreign attachment cannot qualify', () => {
  for (const mode of ['absent', 'foreign', 'extra', 'later']) {
    const proof = createNetworkEventProof(metadata.projectId, network.id);
    proof.accept(event('container', 'create', containerId, attrs));
    if (mode !== 'absent')
      proof.accept(
        event(
          'network',
          'connect',
          mode === 'foreign' ? 'e'.repeat(64) : network.id,
          { container: containerId }
        )
      );
    if (mode === 'extra')
      proof.accept(
        event('network', 'connect', 'e'.repeat(64), { container: containerId })
      );
    proof.accept(event('container', 'start', containerId, attrs));
    if (mode === 'later')
      proof.accept(
        event('network', 'connect', 'e'.repeat(64), { container: containerId })
      );
    assert.equal(proof.result().qualified, false);
  }
});
test('unobserved, incomplete, duplicate or malformed evidence stays unqualified', () => {
  for (const mode of ['none', 'create-only', 'duplicate', 'malformed']) {
    const proof = createNetworkEventProof(metadata.projectId, network.id);
    if (mode !== 'none')
      proof.accept(event('container', 'create', containerId, attrs));
    if (mode === 'duplicate')
      proof.accept(event('container', 'create', containerId, attrs));
    if (mode === 'malformed') proof.accept('not JSON');
    assert.equal(proof.result().qualified, false);
  }
});

test('a successful database-only trace cannot stand in for missing typegen-container evidence', () => {
  const proof = createNetworkEventProof(metadata.projectId, network.id);
  const db = { ...attrs, image: 'ghcr.io/supabase/postgres:17.6.1' };
  proof.accept(event('container', 'create', containerId, db));
  proof.accept(
    event('network', 'connect', network.id, { container: containerId })
  );
  proof.accept(event('container', 'start', containerId, db));
  assert.equal(proof.result().qualified, false);
});

// Synthetic affirmative drain facts for the existing removal fixtures, not runtime proof.
const workerDrains = (context, owned) => ({
  ...JSON.parse(
    '{"version":1,"networkObserverDrained":true,"networkProof":{"observerDrained":true},"relayEvidence":{"drained":true},"startupEvidenceDrained":true}'
  ),
  sourceSha,
  controlSha,
  networkId: owned.id,
  networkNonce: owned.labels['ttr.employee.nonce'],
  workerDrainRecordedAt: Date.now(),
  runId: context.run,
  runAttempt: context.attempt,
});
function networkFixture(t) {
  const directory = fixture(t);
  const context = {
    source: sourceSha,
    control: controlSha,
    run: '123',
    attempt: '1',
    project: metadata.projectId,
    name: network.name,
    marker: path.join(directory, 'owned.json'),
    receiptDirectory: path.join(directory, 'receipts'),
  };
  const labels = Object.fromEntries(
    Object.entries(context)
      .filter(([key]) =>
        ['source', 'control', 'run', 'attempt', 'project'].includes(key)
      )
      .map(([key, value]) => [`ttr.employee.${key}`, value])
  );
  labels['ttr.employee.nonce'] = '00000000-0000-4000-8000-000000000000';
  return { context, owned: { id: network.id, name: network.name, labels } };
}
test('existing marker or existing network denies creation without overwriting ownership', async (t) => {
  const { context } = networkFixture(t);
  writeFileSync(context.marker, 'foreign marker');
  let calls = 0;
  await assert.rejects(
    createEmployeeNetwork('/synthetic', {
      context,
      runner: async () => {
        calls++;
        return Buffer.from('');
      },
    })
  );
  assert.equal(calls, 0);
  assert.equal(readFileSync(context.marker, 'utf8'), 'foreign marker');
  rmSync(context.marker);
  await assert.rejects(
    createEmployeeNetwork('/synthetic', {
      context,
      runner: async () => {
        calls++;
        return Buffer.from('existing id');
      },
    })
  );
  assert.equal(calls, 1);
});
test('actual creator uses internal bridge, fresh nonce labels and exclusive marker ACK', async (t) => {
  const { context } = networkFixture(t);
  const calls = [];
  let labels;
  await createEmployeeNetwork('/synthetic', {
    context,
    runner: async (_command, args) => {
      calls.push(args);
      if (args[1] === 'ls') return Buffer.from('');
      if (args[1] === 'create') {
        labels = Object.fromEntries(
          args.flatMap((value, index) =>
            value === '--label' ? [args[index + 1].split('=')] : []
          )
        );
        assert.equal(args.includes('--internal'), true);
        assert.equal(args.at(-1), context.name);
        return Buffer.from(network.id);
      }
      return Buffer.from(
        JSON.stringify([
          {
            Id: network.id,
            Name: context.name,
            Internal: true,
            Driver: 'bridge',
            Labels: labels,
          },
        ])
      );
    },
  });
  const marker = JSON.parse(readFileSync(context.marker, 'utf8'));
  assert.equal(marker.id, network.id);
  assert.equal(marker.labels['com.supabase.cli.project'], undefined);
  assert.match(marker.labels['ttr.employee.nonce'], /^[a-f0-9-]{36}$/);
  assert.equal(calls.length, 3);
  mkdirSync(context.receiptDirectory);
  const qualificationPath = path.join(
    context.receiptDirectory,
    'qualification.json'
  );
  writeFileSync(
    qualificationPath,
    JSON.stringify({
      ...workerDrains(context, marker),
      schemaQualified: true,
      typesQualified: true,
      networkQualified: true,
      controllerQualified: true,
      consumerQualified: false,
      combinedQualified: false,
    })
  );
  let removed = false;
  await removeEmployeeNetwork('/synthetic', {
    context,
    runner: async (_command, args) => {
      if (args[0] === 'ps' || args[1] === 'ls') return Buffer.from('');
      if (args[1] === 'rm') {
        assert.equal(args[2], network.id);
        assert.equal(args.includes('--force'), false);
        removed = true;
        return Buffer.from(network.id);
      }
      return Buffer.from(
        JSON.stringify([
          {
            Id: network.id,
            Name: context.name,
            Internal: true,
            Driver: 'bridge',
            Labels: marker.labels,
            Containers: {},
          },
        ])
      );
    },
  });
  assert.equal(removed, true);
  const receipt = JSON.parse(readFileSync(qualificationPath, 'utf8'));
  assert.equal(receipt.combinedQualified, true);
  assert.equal(receipt.networkCleanupSucceeded, true);
  assert.equal(receipt.consumerQualified, false);
});
test('unacknowledged create never guesses ownership or deletes an uncertain network', async (t) => {
  const { context } = networkFixture(t);
  const calls = [];
  await assert.rejects(
    createEmployeeNetwork('/synthetic', {
      context,
      runner: async (_command, args) => {
        calls.push(args);
        if (args[1] === 'ls') return Buffer.from('');
        throw new Error('unknown create outcome');
      },
    })
  );
  assert.deepEqual(
    calls.map((args) => args[1]),
    ['ls', 'create']
  );
  assert.throws(() => readFileSync(context.marker));
});
test('foreign owner or any remaining project/foreign attachment denies removal', async (t) => {
  for (const mode of [
    'foreign-owner',
    'remaining-project',
    'foreign-attachment',
  ]) {
    const { context, owned } = networkFixture(t);
    writeFileSync(context.marker, JSON.stringify(owned));
    mkdirSync(context.receiptDirectory);
    writeFileSync(
      path.join(context.receiptDirectory, 'qualification.json'),
      JSON.stringify(workerDrains(context, owned))
    );
    const calls = [];
    await assert.rejects(
      removeEmployeeNetwork('/synthetic', {
        context,
        runner: async (_command, args) => {
          calls.push(args);
          if (args[0] === 'ps')
            return Buffer.from(
              mode === 'remaining-project' ? 'still running' : ''
            );
          const labels =
            mode === 'foreign-owner'
              ? { ...owned.labels, 'ttr.employee.control': 'foreign' }
              : owned.labels;
          return Buffer.from(
            JSON.stringify([
              {
                Id: owned.id,
                Name: owned.name,
                Internal: true,
                Driver: 'bridge',
                Labels: labels,
                Containers:
                  mode === 'foreign-attachment' ? { foreign: {} } : {},
              },
            ])
          );
        },
      })
    );
    assert.equal(
      calls.some((args) => args[0] === 'ps'),
      mode !== 'foreign-owner'
    );
    assert.equal(
      calls.some((args) => args[1] === 'rm'),
      false
    );
  }
});

function markers() {
  return {
    ready: { id: '1'.repeat(64), name: 'ready-marker' },
    end: { id: '2'.repeat(64), name: 'end-marker' },
  };
}
function trace() {
  const { ready, end } = markers();
  return [
    event('network', 'create', ready.id, { name: ready.name }),
    event('container', 'create', containerId, attrs),
    event('network', 'connect', network.id, { container: containerId }),
    event('container', 'start', containerId, attrs),
    event('network', 'disconnect', network.id, { container: containerId }),
    event('container', 'destroy', containerId, attrs),
    event('network', 'create', end.id, { name: end.name }),
  ].map(JSON.parse);
}
test('complete live and authoritative marker-bounded trace qualifies transient generator plus destruction', () => {
  const { ready, end } = markers();
  const rows = trace();
  assert.equal(
    networkCoverageProof(rows, rows, ready, end, metadata.projectId, network.id)
      .qualified,
    true
  );
});
test('history truncation, missed transient, absent destruction and unread shutdown event deny coverage', () => {
  const { ready, end } = markers();
  const rows = trace();
  for (const [live, history] of [
    [rows, rows.slice(1)],
    [rows.filter((e) => e.Type !== 'container'), rows],
    [rows.slice(0, -1), rows],
    [
      rows.filter((e) => e.Action !== 'destroy'),
      rows.filter((e) => e.Action !== 'destroy'),
    ],
  ]) {
    assert.equal(
      networkCoverageProof(
        live,
        history,
        ready,
        end,
        metadata.projectId,
        network.id
      ).qualified,
      false
    );
  }
});
function observerFixture(
  t,
  { emitReady = true, incompleteHistory = false } = {}
) {
  const { context } = networkFixture(t);
  const history = [];
  const networks = new Map();
  let child;
  let next = 1;
  const emit = (line) => {
    history.push(line);
    child.stdin.write(`${line}\n`);
  };
  const runner = async (_command, args) => {
    if (args[0] === 'events')
      return Buffer.from(
        `${(incompleteHistory ? history.slice(1) : history).join('\n')}\n`
      );
    if (args[1] === 'ls') return Buffer.from('');
    if (args[1] === 'create') {
      const id = String(next++).repeat(64),
        name = args.at(-1);
      const labels = Object.fromEntries(
        args.flatMap((v, i) =>
          v === '--label' ? [args[i + 1].split('=')] : []
        )
      );
      networks.set(id, {
        Id: id,
        Name: name,
        Internal: true,
        Driver: 'bridge',
        Labels: labels,
        Containers: {},
      });
      if (emitReady || !name.includes('-ready-'))
        emit(event('network', 'create', id, { name }));
      return Buffer.from(id);
    }
    if (args[1] === 'rm') {
      networks.delete(args[2]);
      return Buffer.from(args[2]);
    }
    return Buffer.from(JSON.stringify([networks.get(args[2])]));
  };
  const observer = startEmployeeNetworkObserver(
    metadata.projectId,
    network.id,
    {
      context,
      runner,
      spawnEvents: () => {
        child = spawn(
          process.execPath,
          [
            '-e',
            'process.stdin.on("data",chunk=>process.stdout.write(chunk));setInterval(()=>{},1000)',
          ],
          { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return child;
      },
    }
  );
  return { observer, emit, child, networks };
}
test('alive process is not readiness; fresh daemon marker ACK is required before replay', async (t) => {
  const { observer, child } = observerFixture(t);
  try {
    await assert.rejects(observer.assertHealthy());
    await observer.ready();
    await observer.assertHealthy();
  } finally {
    await observer.finish();
  }
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
test('bounded delayed subscription without ready ACK denies before lifecycle and cleans marker ownership', async (t) => {
  const { observer, child, networks } = observerFixture(t, {
    emitReady: false,
  });
  try {
    await assert.rejects(observer.ready());
    await assert.rejects(observer.assertHealthy());
  } finally {
    assert.equal((await observer.finish()).qualified, false);
  }
  assert.equal(networks.size, 0);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
test('actual owned stream drains only after final barrier and authoritative coverage snapshot', async (t) => {
  const { observer, emit, child } = observerFixture(t);
  await observer.ready();
  for (const line of [
    event('container', 'create', containerId, attrs),
    event('network', 'connect', network.id, { container: containerId }),
    event('container', 'start', containerId, attrs),
    event('network', 'disconnect', network.id, { container: containerId }),
    event('container', 'destroy', containerId, attrs),
  ])
    emit(line);
  const result = await observer.finish();
  assert.equal(result.qualified, true);
  assert.equal(result.completeHistoryWindow, true);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
test('an authoritative history missing the ready anchor fails despite an apparently healthy live stream', async (t) => {
  const { observer, emit } = observerFixture(t, { incompleteHistory: true });
  await observer.ready();
  for (const line of [
    event('container', 'create', containerId, attrs),
    event('network', 'connect', network.id, { container: containerId }),
    event('container', 'start', containerId, attrs),
    event('container', 'destroy', containerId, attrs),
  ])
    emit(line);
  assert.equal((await observer.finish()).qualified, false);
});

test('entirely missed earlier transient denies even when an observed pgmeta trace looks valid', () => {
  const { ready, end } = markers(),
    live = trace(),
    extra = '3'.repeat(64);
  const added = [
    event('container', 'create', extra, {
      ...attrs,
      image: 'ghcr.io/supabase/postgres:17.6.1',
    }),
    event('network', 'connect', network.id, { container: extra }),
    event('container', 'start', extra, attrs),
    event('container', 'destroy', extra, attrs),
  ].map(JSON.parse);
  const history = [live[0], ...added, ...live.slice(1)];
  assert.equal(
    networkCoverageProof(
      live,
      history,
      ready,
      end,
      metadata.projectId,
      network.id
    ).qualified,
    false
  );
});

for (const image of [
  'ghcr.io/supabase/postgres:17.6.1',
  'foreign.example/unknown:latest',
])
  test(`owned destroy-only lifecycle with ${image} is never covered by a separate valid pgmeta trace`, () => {
    const { ready, end } = markers();
    const rows = trace();
    rows.splice(
      rows.length - 1,
      0,
      JSON.parse(
        event('container', 'destroy', '3'.repeat(64), { ...attrs, image })
      )
    );
    assert.equal(
      networkCoverageProof(
        rows,
        rows,
        ready,
        end,
        metadata.projectId,
        network.id
      ).qualified,
      false
    );
  });

test('exact owned removal acknowledges drain even when prior qualification failed', async (t) => {
  const { context, owned } = networkFixture(t);
  writeFileSync(context.marker, JSON.stringify(owned));
  mkdirSync(context.receiptDirectory);
  const receiptPath = path.join(context.receiptDirectory, 'qualification.json');
  writeFileSync(
    receiptPath,
    JSON.stringify({
      ...workerDrains(context, owned),
      schemaQualified: false,
      typesQualified: false,
      networkQualified: false,
      combinedQualified: false,
    })
  );
  let removed = false;
  await assert.doesNotReject(
    removeEmployeeNetwork('/synthetic', {
      context,
      runner: async (_command, args) => {
        if (args[0] === 'ps' || args[1] === 'ls') return Buffer.from('');
        if (args[1] === 'rm') {
          assert.equal(args[2], owned.id);
          removed = true;
          return Buffer.from(owned.id);
        }
        return Buffer.from(
          JSON.stringify([
            {
              Id: owned.id,
              Name: owned.name,
              Internal: true,
              Driver: 'bridge',
              Labels: owned.labels,
              Containers: {},
            },
          ])
        );
      },
    })
  );
  assert.equal(removed, true);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.networkCleanupSucceeded, true);
  assert.equal(receipt.combinedQualified, false);
  assert.equal(receipt.schemaQualified, false);
  assert.equal(receipt.typesQualified, false);
  assert.equal(receipt.networkQualified, false);
});

for (const mode of ['unknown-remove', 'qualification-binding-mismatch'])
  test(`cleanup ${mode} never acknowledges qualification or mutates its receipt`, async (t) => {
    const { context, owned } = networkFixture(t);
    writeFileSync(context.marker, JSON.stringify(owned));
    mkdirSync(context.receiptDirectory);
    const receiptPath = path.join(
      context.receiptDirectory,
      'qualification.json'
    );
    const before = JSON.stringify({
      ...workerDrains(context, owned),
      sourceSha:
        mode === 'qualification-binding-mismatch' ? 'f'.repeat(40) : sourceSha,
      schemaQualified: false,
      typesQualified: false,
      networkQualified: false,
      combinedQualified: false,
    });
    writeFileSync(receiptPath, before);
    let removed = false;
    await assert.rejects(
      removeEmployeeNetwork('/synthetic', {
        context,
        runner: async (_command, args) => {
          if (args[0] === 'ps' || args[1] === 'ls') return Buffer.from('');
          if (args[1] === 'rm') {
            assert.equal(args[2], owned.id);
            if (mode === 'unknown-remove')
              throw new Error('private unknown removal response');
            removed = true;
            return Buffer.from(owned.id);
          }
          return Buffer.from(
            JSON.stringify([
              {
                Id: owned.id,
                Name: owned.name,
                Internal: true,
                Driver: 'bridge',
                Labels: owned.labels,
                Containers: {},
              },
            ])
          );
        },
      })
    );
    assert.equal(readFileSync(receiptPath, 'utf8'), before);
    assert.equal(removed, false);
    const cleanupPath = path.join(
      context.receiptDirectory,
      'network-cleanup.json'
    );
    assert.throws(() => readFileSync(cleanupPath));
  });
