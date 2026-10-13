import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  createEmployeeLoopbackRelay,
  parseEmployeeRelayEvidence,
  startEmployeeLoopbackRelay,
  validateEmployeeRelayPeer,
} from './employee-schema-loopback-relay.mjs';
import { removeEmployeeNetwork } from './employee-schema-network.mjs';
import * as controllerHelpers from './employee-schema-typegen.mjs';

const input = {
  sourceSha: 'a'.repeat(40),
  controlSha: 'b'.repeat(40),
  projectId: 'tt-source-aaaaaaaa-0123456789',
  dbPort: 54329,
  imageRef: 'ghcr.io/supabase/postgres:17.6.1.167',
  network: {
    id: 'c'.repeat(64),
    name: 'tt-employee-net-1-1',
    labels: {
      'ttr.employee.source': 'a'.repeat(40),
      'ttr.employee.control': 'b'.repeat(40),
      'ttr.employee.project': 'tt-source-aaaaaaaa-0123456789',
      'ttr.employee.run': '1',
      'ttr.employee.attempt': '1',
      'ttr.employee.nonce': 'd'.repeat(36),
    },
  },
};
const marker = {
  id: '1'.repeat(64),
  name: `${input.network.name}-ready-12345678`,
  labels: input.network.labels,
};
const endId = '2'.repeat(64),
  containerId = 'e'.repeat(64);
const network = () => ({
  id: input.network.id,
  name: input.network.name,
  internal: true,
  driver: 'bridge',
  cliProject: null,
  labels: Object.fromEntries(
    Object.entries(input.network.labels).map(([key, value]) => [
      key.replace('ttr.employee.', ''),
      value,
    ])
  ),
  subnets: [{ Subnet: '172.19.0.0/16' }],
});
const snapshot = () => ({
  id: containerId,
  name: `/supabase_db_${input.projectId}`,
  project: input.projectId,
  image: input.imageRef,
  running: true,
  health: 'healthy',
  networkCount: 1,
  endpoint: { id: input.network.id, ip: '172.19.0.2', prefix: 16 },
});
const clone = structuredClone;
for (const [name, change] of [
  [
    'foreign identity',
    (s) => {
      s.project = 'foreign';
    },
  ],
  [
    'wrong image',
    (s) => {
      s.image = 'foreign/image';
    },
  ],
  [
    'extra network',
    (s) => {
      s.networkCount = 2;
    },
  ],
  [
    'wrong network ID',
    (s) => {
      s.endpoint.id = '9'.repeat(64);
    },
  ],
  [
    'unhealthy',
    (s) => {
      s.health = 'starting';
    },
  ],
  [
    'public address',
    (s) => {
      s.endpoint.ip = '8.8.8.8';
    },
  ],
  [
    'outside subnet',
    (s) => {
      s.endpoint.ip = '172.20.0.2';
    },
  ],
  [
    'subnet broadcast',
    (s) => {
      s.endpoint.ip = '172.19.255.255';
    },
  ],
]) {
  test(`relay rejects ${name} before any target connection`, () => {
    const s = snapshot();
    change(s);
    assert.throws(
      () => validateEmployeeRelayPeer(s, network(), input),
      /unavailable/
    );
  });
}

test('all finalizers run after earlier failures, with false ACKs and fixed private-free enums', async () => {
  const calls = [];
  const result = await controllerHelpers.finishEmployeeControllerWorkers({
    network: {
      finish: async () => {
        calls.push('network');
        throw new Error('private network payload');
      },
    },
    relay: {
      finish: async (markerId) => {
        calls.push('relay');
        assert.equal(markerId, undefined);
        return controllerHelpers.emptyEmployeeRelayEvidence();
      },
    },
    startup: {
      finish: async (markerId) => {
        calls.push('startup');
        assert.equal(markerId, undefined);
        throw new Error('private startup payload');
      },
    },
  });
  assert.deepEqual(calls, ['network', 'relay', 'startup']);
  assert.equal(result.networkProof.observerDrained, false);
  assert.equal(result.relayEvidence.drained, false);
  assert.equal(result.startupEvidence.observerDrained, false);
  assert.deepEqual(result.failures, [
    'network-finish-denied',
    'relay-drain-unconfirmed',
    'startup-finish-denied',
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private (network|startup) payload/
  );
});
test('actual controller finish boundary persists evidence and attempts startup after relay rejection', async () => {
  const controller = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  const begin = controller.includes('const finalization =')
    ? controller.indexOf('const finalization =')
    : controller.indexOf(
        'const networkProof = await networkObserver.finish();'
      );
  const body = controller.slice(
    begin,
    controller.indexOf('const receipt = {', begin)
  );
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const execute = new AsyncFunction(
    'networkObserver',
    'relay',
    'startupObserver',
    'emptyEmployeeStartEvidence',
    'finishEmployeeControllerWorkers',
    'writeFileSync',
    'path',
    'receiptDirectory',
    'sourceSha',
    'controlSha',
    body
  );
  let startupCalls = 0,
    writes = 0;
  await assert.doesNotReject(
    execute(
      { finish: async () => ({ qualified: false, observerDrained: true }) },
      {
        finish: async () => {
          throw new Error('synthetic private failure');
        },
      },
      {
        finish: async () => {
          startupCalls++;
          return controllerHelpers.emptyEmployeeStartEvidence();
        },
      },
      controllerHelpers.emptyEmployeeStartEvidence,
      controllerHelpers.finishEmployeeControllerWorkers,
      () => {
        writes++;
      },
      { join: (...parts) => parts.join('/') },
      'synthetic',
      input.sourceSha,
      input.controlSha
    )
  );
  assert.equal(startupCalls, 1);
  assert.equal(writes, 1);
});
for (const mode of [
  'missing',
  'false-relay',
  'false-network',
  'false-network-proof',
  'false-startup',
  'missing-identity',
  'malformed',
  'foreign',
  'stale',
  'safe-denied',
]) {
  test(`actual network removal requires affirmative fresh workers: ${mode}`, async (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'employee-drain-fence-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const context = {
      source: input.sourceSha,
      control: input.controlSha,
      project: input.projectId,
      run: '1',
      attempt: '1',
      name: input.network.name,
      marker: path.join(root, 'network.json'),
      receiptDirectory: root,
    };
    writeFileSync(context.marker, JSON.stringify(input.network));
    const receipt = {
      version: 1,
      sourceSha: input.sourceSha,
      controlSha: input.controlSha,
      networkId: input.network.id,
      networkNonce: input.network.labels['ttr.employee.nonce'],
      runId: '1',
      runAttempt: '1',
      workerDrainRecordedAt: Date.now(),
      schemaQualified: false,
      typesQualified: false,
      networkQualified: false,
      controllerQualified: false,
      networkObserverDrained: true,
      networkProof: { observerDrained: true },
      relayEvidence: { drained: true },
      startupEvidenceDrained: true,
    };
    if (mode === 'false-relay') receipt.relayEvidence.drained = false;
    if (mode === 'false-network') receipt.networkObserverDrained = false;
    if (mode === 'false-network-proof')
      receipt.networkProof.observerDrained = false;
    if (mode === 'false-startup') receipt.startupEvidenceDrained = false;
    if (mode === 'missing-identity') delete receipt.networkId;
    if (mode === 'foreign') receipt.controlSha = '9'.repeat(40);
    if (mode === 'stale') receipt.workerDrainRecordedAt -= 120000;
    if (mode !== 'missing')
      writeFileSync(
        path.join(root, 'qualification.json'),
        mode === 'malformed' ? '{' : JSON.stringify(receipt)
      );
    let mutations = 0;
    const raw = {
      Id: input.network.id,
      Name: input.network.name,
      Internal: true,
      Driver: 'bridge',
      Labels: input.network.labels,
      Containers: {},
    };
    const runner = async (_command, args) => {
      if (args[0] === 'network' && args[1] === 'inspect')
        return Buffer.from(JSON.stringify([raw]));
      if (args[0] === 'network' && args[1] === 'rm') mutations++;
      return Buffer.from('');
    };
    const outcome = await removeEmployeeNetwork(root, {
      context,
      runner,
    }).catch(() => null);
    assert.equal(mutations, mode === 'safe-denied' ? 1 : 0);
    if (mode === 'safe-denied')
      assert.deepEqual(outcome, {
        networkCleanupSucceeded: true,
        combinedQualified: false,
      });
    else assert.equal(outcome, null);
  });
}
test('relay selects only exact daemon-owned private endpoint, not requested host publication', () => {
  assert.deepEqual(validateEmployeeRelayPeer(snapshot(), network(), input), {
    id: containerId,
    host: '172.19.0.2',
    port: 5432,
  });
  const n = network();
  n.internal = false;
  assert.throws(() => validateEmployeeRelayPeer(snapshot(), n, input));
});
test('relay evidence rejects private extra fields and unknown booleans', () => {
  assert.throws(() =>
    parseEmployeeRelayEvidence({ listenerReady: true, password: 'synthetic' })
  );
});
class Events extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill() {
    queueMicrotask(() => this.emit('close', 0));
    return true;
  }
  event(row) {
    this.stdout.write(`${JSON.stringify(row)}\n`);
  }
}
const markerEvent = (id, name) => ({
  Type: 'network',
  Action: 'create',
  Actor: { ID: id, Attributes: { name } },
});
const dbEvent = (id = containerId) => ({
  Type: 'container',
  Action: 'start',
  Actor: {
    ID: id,
    Attributes: {
      name: `supabase_db_${input.projectId}`,
      'com.supabase.cli.project': input.projectId,
      image: input.imageRef,
    },
  },
});
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function fixture(
  t,
  { selected = snapshot(), connect, connectionMs } = {}
) {
  const events = new Events(),
    own = clone(input);
  own.dbPort = await availablePort();
  let reads = 0,
    upstreamCalls = 0;
  const core = await createEmployeeLoopbackRelay(own, {
    connectionMs,
    read: async (args) => {
      reads++;
      return args[0] === 'network' ? network() : clone(selected);
    },
    spawnEvents: () => events,
    connect: (args) => {
      upstreamCalls++;
      assert.equal(args.host, '172.19.0.2');
      assert.equal(args.port, 5432);
      return connect(args);
    },
  });
  events.event(markerEvent(marker.id, marker.name));
  await core.ready(marker);
  await core.phase('start');
  events.event(dbEvent());
  t.after(async () => {
    events.event(markerEvent(endId, `${input.network.name}-end-12345678`));
    await core.finish(endId);
  });
  return {
    core,
    events,
    own,
    reads: () => reads,
    upstreamCalls: () => upstreamCalls,
  };
}
test('no host listener fails; exact owned relay carries literal synthetic handshake and drains', async (t) => {
  const db = net.createServer((socket) =>
    socket.on('data', (b) => {
      assert.equal(b.toString(), 'literal-synthetic-bootstrap');
      socket.end('synthetic-ready');
    })
  );
  await new Promise((resolve) => db.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => db.close(resolve)));
  const absentPort = await availablePort();
  await assert.rejects(
    new Promise((resolve, reject) => {
      const s = net.createConnection({ host: '127.0.0.1', port: absentPort });
      s.on('error', reject);
      s.on('connect', () => {
        s.destroy();
        resolve();
      });
    })
  );
  const f = await fixture(t, {
    connect: () =>
      net.createConnection({ host: '127.0.0.1', port: db.address().port }),
  });
  const response = await new Promise((resolve, reject) => {
    const client = net.createConnection({
      host: '127.0.0.1',
      port: f.own.dbPort,
    });
    let bytes = '';
    client.on('connect', () => client.write('literal-synthetic-bootstrap'));
    client.on('data', (b) => {
      bytes += b;
    });
    client.on('error', reject);
    client.on('end', () => resolve(bytes));
  });
  assert.equal(response, 'synthetic-ready');
  assert.equal(f.upstreamCalls(), 1);
  assert.equal(f.core.snapshot().connected, true);
  assert.equal(f.core.snapshot().targetVerified, true);
  await f.core.phase('reset');
  await f.core.phase('typegen');
  await f.core.phase('cleanup');
});
test('foreign readback closes client with zero upstream calls', async (t) => {
  const selected = snapshot();
  selected.project = 'foreign';
  const f = await fixture(t, {
    selected,
    connect: () => {
      throw new Error('must not connect');
    },
  });
  await new Promise((resolve) => {
    const c = net.createConnection({ host: '127.0.0.1', port: f.own.dbPort });
    c.on('error', () => {});
    c.on('close', resolve);
  });
  assert.equal(f.upstreamCalls(), 0);
  assert.equal(f.core.snapshot().denied, true);
});
test('phase cannot skip reset, and more than four exact target generations deny', async (t) => {
  const f = await fixture(t, {
    connect: () => {
      throw new Error('must not connect');
    },
  });
  await assert.rejects(f.core.phase('typegen'));
  for (const char of ['3', '4', '5', '6'])
    f.events.event(dbEvent(char.repeat(64)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.core.snapshot().denied, true);
});
test('occupied listener never falls back and drains its owned event process', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const own = clone(input);
  own.dbPort = server.address().port;
  const events = new Events();
  let killed = false;
  events.kill = () => {
    killed = true;
    queueMicrotask(() => events.emit('close', 0));
  };
  try {
    await assert.rejects(
      createEmployeeLoopbackRelay(own, {
        read: async () => network(),
        spawnEvents: () => events,
      })
    );
    assert.equal(killed, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('historical same-project events before ready cannot consume target generations', async () => {
  const events = new Events(),
    own = clone(input);
  own.dbPort = await availablePort();
  const core = await createEmployeeLoopbackRelay(own, {
    read: async () => network(),
    spawnEvents: () => events,
  });
  for (const char of ['3', '4', '5', '6', '7', '8'])
    events.event(dbEvent(char.repeat(64)));
  events.event(markerEvent(marker.id, marker.name));
  await core.ready(marker);
  await core.phase('start');
  assert.equal(core.snapshot().denied, false);
  events.event(markerEvent(endId, `${input.network.name}-end-12345678`));
  const result = await core.finish(endId);
  assert.equal(result.drained, true);
  assert.equal(result.denied, false);
});
test('per-connection deadline destroys both exact socket ends', async (t) => {
  const remote = net.createServer(() => {});
  await new Promise((resolve) => remote.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => remote.close(resolve)));
  const f = await fixture(t, {
    connectionMs: 30,
    connect: () =>
      net.createConnection({ host: '127.0.0.1', port: remote.address().port }),
  });
  await new Promise((resolve) => {
    const c = net.createConnection({ host: '127.0.0.1', port: f.own.dbPort });
    c.on('error', () => {});
    c.on('close', resolve);
  });
  assert.equal(f.core.snapshot().denied, true);
});
test('ninth pending client denies without an unproved target or upstream dial', async () => {
  const events = new Events(),
    own = clone(input);
  own.dbPort = await availablePort();
  let calls = 0;
  const core = await createEmployeeLoopbackRelay(own, {
    read: async () => network(),
    spawnEvents: () => events,
    connect: () => {
      calls++;
      throw new Error('must not connect');
    },
  });
  events.event(markerEvent(marker.id, marker.name));
  await core.ready(marker);
  await core.phase('start');
  const clients = Array.from({ length: 9 }, () =>
    net.createConnection({ host: '127.0.0.1', port: own.dbPort })
  );
  await Promise.all(
    clients.map(
      (client) =>
        new Promise((resolve) => {
          client.on('error', () => {});
          client.on('close', resolve);
        })
    )
  );
  assert.equal(calls, 0);
  assert.equal(core.snapshot().denied, true);
  events.event(markerEvent(endId, `${input.network.name}-end-12345678`));
  assert.equal((await core.finish(endId)).drained, true);
});
test('phase read budget refuses the next connection before an extra upstream dial', async (t) => {
  const db = net.createServer((socket) => socket.end('bounded'));
  await new Promise((resolve) => db.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => db.close(resolve)));
  const f = await fixture(t, {
    connect: () =>
      net.createConnection({ host: '127.0.0.1', port: db.address().port }),
  });
  for (let i = 0; i < 43; i++) {
    const response = await new Promise((resolve) => {
      const client = net.createConnection({
        host: '127.0.0.1',
        port: f.own.dbPort,
      });
      let bytes = '';
      client.on('data', (chunk) => {
        bytes += chunk;
      });
      client.on('error', () => {});
      client.on('close', () => resolve(bytes));
    });
    assert.equal(response, i < 42 ? 'bounded' : '');
  }
  assert.equal(f.upstreamCalls(), 42);
  assert.equal(f.reads(), 129); // One initial read plus at most128 phase calls.
  assert.equal(f.core.snapshot().denied, true);
});
// Actual production Linux entrypoint with private fake Docker, not a daemon/database.
for (const mode of [
  'valid',
  'foreign-network',
  'malformed-network',
  'wrong-authority',
  'wrong-group',
  'missing-reader',
]) {
  test(`production relay Linux admission ${mode}`, {
    skip: process.platform !== 'linux',
    timeout: 12000,
  }, async (t) => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'employee-relay-production-')
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const own = clone(input);
    own.dbPort = await availablePort();
    const selected = network();
    if (mode === 'foreign-network') selected.labels.project = 'foreign';
    const rows = [
      markerEvent(marker.id, marker.name),
      markerEvent(endId, `${input.network.name}-end-12345678`),
    ];
    if (mode !== 'missing-reader')
      writeFileSync(
        path.join(root, 'docker'),
        `#!${process.execPath}
const args=process.argv.slice(2);
if(args.includes('events')){process.stdout.write(${JSON.stringify(`${rows.map(JSON.stringify).join('\n')}\n`)});setInterval(()=>{},1000);}
else if(args.includes('network')&&args.includes('inspect'))process.stdout.write(${JSON.stringify(mode === 'malformed-network' ? '{' : JSON.stringify(selected))});
else process.exit(1);
`,
        { mode: 0o700 }
      );
    const relay = startEmployeeLoopbackRelay(own, {
      forkWorker: (file, args, options) => {
        assert.deepEqual(Object.keys(options.env).sort(), [
          'DOCKER_CONFIG',
          'GITHUB_ACTIONS',
          'GITHUB_EVENT_NAME',
          'GITHUB_REPOSITORY',
          'PATH',
        ]);
        assert.equal(options.detached, true);
        const child = fork(file, args, {
          ...options,
          env: {
            ...options.env,
            PATH: root,
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REPOSITORY:
              mode === 'wrong-authority'
                ? 'foreign/repository'
                : 'tutur3u/platform',
          },
        });
        const send = child.send.bind(child);
        child.send = (m, cb) =>
          send(
            mode === 'wrong-group' && m.type === 'init'
              ? { ...m, value: { ...m.value, groupPid: child.pid + 1 } }
              : m,
            cb
          );
        return child;
      },
    });
    try {
      if (mode === 'valid') {
        await relay.started();
        assert.equal((await relay.ready(marker)).listenerReady, true);
        await relay.phase('start');
        await relay.phase('cleanup');
      } else await assert.rejects(relay.started(), /unavailable/);
    } finally {
      const evidence = await relay.finish(endId);
      assert.equal(evidence.drained, true);
      assert.equal(evidence.denied, mode !== 'valid');
    }
  });
}
