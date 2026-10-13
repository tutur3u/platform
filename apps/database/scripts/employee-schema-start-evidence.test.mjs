import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { removeEmployeeNetwork } from './employee-schema-network.mjs';
import {
  collectEmployeeDbSnapshot,
  createEmployeeEvidenceObserver,
  emptyEmployeeStartEvidence,
  parseEmployeeStartEvidence,
  probeEmployeeLoopback,
  startEmployeeDbStartEvidence,
  startupAdmissionDiagnostic,
  validateEmployeeStartInput,
} from './employee-schema-start-evidence.mjs';
import { employeeStartupConnectionEvidence } from './employee-schema-typegen.mjs';

const sourceSha = 'a'.repeat(40),
  controlSha = 'b'.repeat(40);
const projectId = 'tt-source-aaaaaaaa-0123456789';
const input = {
  sourceSha,
  controlSha,
  projectId,
  dbPort: 54329,
  imageRef: 'ghcr.io/supabase/postgres:17.6.1.167',
  network: {
    id: 'c'.repeat(64),
    name: 'tt-employee-net-1-1',
    labels: {
      'ttr.employee.source': sourceSha,
      'ttr.employee.control': controlSha,
      'ttr.employee.project': projectId,
      'ttr.employee.run': '1',
      'ttr.employee.attempt': '1',
      'ttr.employee.nonce': 'd'.repeat(36),
    },
  },
};
const containerId = 'e'.repeat(64),
  endId = 'f'.repeat(64);
const marker = {
  id: '1'.repeat(64),
  name: `${input.network.name}-ready-12345678`,
  labels: input.network.labels,
};
const clone = (value) => structuredClone(value);
function network() {
  return {
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
  };
}
function snapshot() {
  return {
    id: containerId,
    name: `/supabase_db_${projectId}`,
    image: input.imageRef,
    project: projectId,
    running: true,
    health: 'healthy',
    mode: input.network.name,
    requested: { '5432/tcp': [{ HostIp: '', HostPort: String(input.dbPort) }] },
    ports: {
      '5432/tcp': [
        { HostIp: '0.0.0.0', HostPort: String(input.dbPort) },
        { HostIp: '::', HostPort: String(input.dbPort) },
      ],
    },
    networks: { [input.network.name]: { NetworkID: input.network.id } },
  };
}
function reader(rows = [snapshot()], root = network()) {
  let inspections = 0;
  const read = async (args) => {
    assert.equal(
      args.some(
        (arg) => arg.includes?.('Config.Env') || arg.includes?.('Health.Log')
      ),
      false
    );
    if (args[0] === 'version') return '28.0.4';
    if (args[0] === 'network') return JSON.stringify(root);
    return JSON.stringify(rows[Math.min(inspections++, rows.length - 1)]);
  };
  return { read, inspections: () => inspections };
}
function event(type, action, id, attrs) {
  return { Type: type, Action: action, Actor: { ID: id, Attributes: attrs } };
}
function events() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    setImmediate(() => {
      child.signalCode = 'SIGTERM';
      child.emit('close', null, 'SIGTERM');
    });
    return true;
  };
  return {
    child,
    emit: (row) => child.stdout.write(`${JSON.stringify(row)}\n`),
  };
}
const markerEvent = (id, name) => event('network', 'create', id, { name });
const dbEvent = (action, id = containerId) =>
  event('container', action, id, {
    name: `supabase_db_${projectId}`,
    'com.supabase.cli.project': projectId,
  });

test('exact input and boolean output reject extra/raw data and foreign owners', () => {
  assert.equal(validateEmployeeStartInput(input), input);
  for (const change of [
    { dbPort: 80 },
    { imageRef: 'foreign/image' },
    { uri: 'postgres://private' },
    { sourceSha: 'x' },
  ])
    assert.throws(
      () => validateEmployeeStartInput({ ...input, ...change }),
      /unavailable/
    );
  const foreign = clone(input);
  foreign.network.labels['ttr.employee.project'] = 'foreign';
  assert.throws(() => validateEmployeeStartInput(foreign), /unavailable/);
  const output = emptyEmployeeStartEvidence();
  assert.deepEqual(parseEmployeeStartEvidence(output), output);
  assert.throws(
    () => parseEmployeeStartEvidence({ ...output, raw: 'private' }),
    /unavailable/
  );
  assert.throws(
    () => parseEmployeeStartEvidence({ ...output, healthyObserved: 'true' }),
    /unavailable/
  );
});

test('requested mapping without effective mapping never probes or fabricates health loss', async () => {
  const row = snapshot();
  row.ports = { '5432/tcp': null };
  const { read } = reader([row]);
  let probes = 0;
  const result = await collectEmployeeDbSnapshot(input, containerId, {
    read,
    probe: async () => {
      probes++;
    },
  });
  assert.equal(result.requested5432MappingMatchesChosenPort, true);
  assert.equal(result.effective5432MappingPresent, false);
  assert.equal(result.healthyObserved, true);
  assert.equal(result.loopbackProbeSkippedOwnershipUnproven, true);
  assert.equal(probes, 0);
  assert.equal(JSON.stringify(result).includes(String(input.dbPort)), false);
});

test('valid fresh owned IPv4 binding admits only chosen loopback target and drains probe', async () => {
  const r = reader();
  const calls = [];
  const result = await collectEmployeeDbSnapshot(input, containerId, {
    read: r.read,
    probe: async (port) => {
      calls.push(port);
      return { connected: true, refused: false, timedOut: false };
    },
  });
  assert.deepEqual(calls, [54329]);
  assert.equal(r.inspections(), 2);
  assert.equal(result.loopbackTcpConnected, true);
  assert.equal(result.soleInternalNetworkVerified, true);
  assert.equal(result.observerUncertain, false);
});

for (const [label, mutate] of [
  [
    'foreign identity',
    (r) => {
      r.project = 'foreign';
    },
  ],
  [
    'foreign image',
    (r) => {
      r.image = 'foreign/image';
    },
  ],
  [
    'foreign name',
    (r) => {
      r.name = '/foreign';
    },
  ],
  [
    'additional network',
    (r) => {
      r.networks.foreign = { NetworkID: '2'.repeat(64) };
    },
  ],
  [
    'wrong effective target',
    (r) => {
      r.ports['5432/tcp'][0].HostPort = '54330';
    },
  ],
])
  test(`${label} cannot produce a TCP probe`, async () => {
    const row = snapshot();
    mutate(row);
    let probes = 0;
    const result = await collectEmployeeDbSnapshot(input, containerId, {
      read: reader([row]).read,
      probe: async () => {
        probes++;
      },
    });
    assert.equal(probes, 0);
    assert.equal(result.loopbackProbeAttempted, false);
  });

test('fresh readback loss and foreign root network prevent a previously plausible probe', async () => {
  const changed = snapshot();
  changed.running = false;
  for (const r of [
    reader([snapshot(), changed]),
    reader([snapshot()], { ...network(), internal: false }),
  ]) {
    let probes = 0;
    const result = await collectEmployeeDbSnapshot(input, containerId, {
      read: r.read,
      probe: async () => {
        probes++;
      },
    });
    assert.equal(probes, 0);
    assert.equal(result.observerUncertain, true);
    assert.equal(result.inspectionLostBeforeTeardown, true);
  }
});

test('literal connection subtype/target flags are redacted and ambiguous/truncated data stays unknown', () => {
  const result = employeeStartupConnectionEvidence(
    {
      stderr:
        'dial tcp 127.0.0.1:54329: connect: connection refused; postgres://private.example/secret',
    },
    54329
  );
  assert.equal(result.refusedSignature, true);
  assert.equal(result.ownedIpv4LoopbackTargetSignature, true);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(
    employeeStartupConnectionEvidence(
      { stderr: 'dial tcp 127.0.0.1:54330: connect: connection refused' },
      54329
    ).ownedIpv4LoopbackTargetSignature,
    false
  );
  const ambiguous = employeeStartupConnectionEvidence(
    { stderr: 'connect: connection refused; i/o timeout' },
    54329
  );
  assert.equal(ambiguous.subtypeAmbiguous, true);
  assert.equal(ambiguous.subtypeKnown, false);
  assert.equal(
    employeeStartupConnectionEvidence(
      { stderr: 'connection refused', error: { code: 'ENOBUFS' } },
      54329
    ).stderrComplete,
    false
  );
});

test('real finite TCP fixture receives no application bytes and closes before acknowledgement', async (t) => {
  let bytes = 0;
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      bytes += chunk.length;
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await probeEmployeeLoopback(server.address().port);
  assert.deepEqual(result, {
    connected: true,
    refused: false,
    timedOut: false,
  });
  assert.equal(bytes, 0);
});

test('timeout acknowledgement awaits the exact socket close', async () => {
  const socket = new EventEmitter();
  let destroyed = false,
    closed = false;
  socket.destroy = () => {
    destroyed = true;
    setTimeout(() => {
      closed = true;
      socket.emit('close');
    }, 10);
  };
  const result = await probeEmployeeLoopback(54329, {
    connect: () => socket,
    timeoutMs: 5,
  });
  assert.equal(destroyed, true);
  assert.equal(closed, true);
  assert.deepEqual(result, {
    connected: false,
    refused: false,
    timedOut: true,
  });
});

test('alive reader cannot acknowledge readiness without the exact daemon marker', async () => {
  const stream = events();
  const observer = await createEmployeeEvidenceObserver(input, {
    read: reader().read,
    spawnEvents: () => stream.child,
    waitMs: 15,
  });
  await assert.rejects(observer.ready(marker), /unavailable/);
  const result = await observer.finish(endId);
  assert.equal(result.observerReady, false);
  assert.equal(result.observerUncertain, true);
});

test('delayed marker readiness, selected read budget, and initial generation only', async () => {
  const stream = events(),
    r = reader();
  let probes = 0;
  const observer = await createEmployeeEvidenceObserver(input, {
    read: r.read,
    spawnEvents: () => stream.child,
    waitMs: 100,
    probe: async () => {
      probes++;
      return { connected: true, refused: false, timedOut: false };
    },
  });
  const ready = observer.ready(marker);
  setTimeout(() => stream.emit(markerEvent(marker.id, marker.name)), 5);
  assert.equal((await ready).observerReady, true);
  stream.emit(dbEvent('create'));
  stream.emit(dbEvent('start'));
  stream.emit(dbEvent('health_status: healthy'));
  stream.emit(dbEvent('health_status: unhealthy'));
  stream.emit(dbEvent('destroy'));
  stream.emit(dbEvent('start', '2'.repeat(64)));
  stream.emit(markerEvent(endId, 'end'));
  const result = await observer.finish(endId);
  assert.equal(result.observerEndSeen, true);
  assert.equal(result.healthyObserved, true);
  assert.equal(r.inspections(), 3);
  assert.equal(probes, 1);
});

test('missing end marker or truncated event framing is not complete observation', async () => {
  for (const truncate of [false, true]) {
    const stream = events();
    const observer = await createEmployeeEvidenceObserver(input, {
      read: reader().read,
      spawnEvents: () => stream.child,
      waitMs: 15,
    });
    stream.emit(markerEvent(marker.id, marker.name));
    await observer.ready(marker);
    if (truncate) {
      stream.emit(markerEvent(endId, 'end'));
      stream.child.stdout.write('{"private');
    }
    const result = await observer.finish(endId);
    assert.equal(result.observerUncertain, true);
    assert.equal(result.observerEndSeen, truncate);
  }
});

function fixtureWorker(t, mode) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'employee-start-test-'));
  const filename = path.join(root, 'fixture.mjs');
  const code = `const empty=${JSON.stringify(emptyEmployeeStartEvidence())};
    process.on('message',m=>{let result={...empty};
      if(m.type==='init')result.observerUncertain=Boolean(process.env.EMPLOYEE_EVIDENCE_SYNTHETIC_SECRET);
      if(m.type==='ready')result.observerReady=${mode !== 'false-ready'};
      if(m.type==='finish'){result.observerReady=true;result.observerEndSeen=true;}
      if(${JSON.stringify(mode)}==='raw')result.raw='synthetic-private';
      if(${JSON.stringify(mode)}==='hang')return;
      process.send({id:m.id,ok:true,result});
    }); setInterval(()=>{},1000);`;
  writeFileSync(filename, code);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return (_file, args, options) => {
    assert.equal(options.env.EMPLOYEE_EVIDENCE_SYNTHETIC_SECRET, undefined);
    assert.deepEqual(options.execArgv, []);
    assert.equal(options.detached, true);
    process.env.EMPLOYEE_EVIDENCE_SYNTHETIC_SECRET = 'synthetic-value-only';
    try {
      return fork(filename, args, options);
    } finally {
      delete process.env.EMPLOYEE_EVIDENCE_SYNTHETIC_SECRET;
    }
  };
}

test('real isolated IPC lifecycle returns only booleans after owned worker drain', async (t) => {
  const observer = startEmployeeDbStartEvidence(input, {
    forkWorker: fixtureWorker(t, 'valid'),
    rpcMs: 1000,
    deadlineMs: 5000,
  });
  await observer.started();
  await observer.ready(marker);
  const result = await observer.finish(endId);
  assert.equal(result.observerDrained, true);
  assert.equal(result.observerEndSeen, true);
  assert.deepEqual(parseEmployeeStartEvidence(result), result);
});

for (const mode of ['false-ready', 'raw', 'hang'])
  test(`real IPC ${mode} denies and drains only its owned worker`, async (t) => {
    const observer = startEmployeeDbStartEvidence(input, {
      forkWorker: fixtureWorker(t, mode),
      rpcMs: 100,
      deadlineMs: 1000,
    });
    if (mode === 'false-ready') {
      await observer.started();
      await assert.rejects(observer.ready(marker), /unavailable/);
    } else await assert.rejects(observer.started(), /unavailable/);
    const result = await observer.finish(endId);
    assert.equal(result.observerDrained, true);
    assert.equal(result.observerUncertain, true);
  });

test('failed selected read cannot become unhealthy or carry private error text', async () => {
  const result = await collectEmployeeDbSnapshot(input, containerId, {
    read: async () => {
      throw new Error('postgres://synthetic-private');
    },
    probe: async () => {
      assert.fail('unproven target must not be probed');
    },
  });
  assert.equal(result.observerUncertain, true);
  assert.equal(result.inspectionLostBeforeTeardown, true);
  assert.equal(result.unhealthyObserved, false);
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
});

test('actual unhealthy observation is distinct from unknown state and never resets the generation identity', async () => {
  const stream = events();
  const row = snapshot();
  row.health = 'unhealthy';
  row.ports = {};
  const r = reader([row]);
  const observer = await createEmployeeEvidenceObserver(input, {
    read: r.read,
    spawnEvents: () => stream.child,
    waitMs: 30,
  });
  stream.emit(markerEvent(marker.id, marker.name));
  await observer.ready(marker);
  stream.emit(dbEvent('start'));
  stream.emit(dbEvent('destroy'));
  stream.emit(dbEvent('start', '2'.repeat(64)));
  stream.emit(markerEvent(endId, 'end'));
  const result = await observer.finish(endId);
  assert.equal(result.unhealthyObserved, true);
  assert.equal(result.healthyObserved, false);
  assert.equal(r.inspections(), 1);
  assert.equal(result.loopbackProbeAttempted, false);
});

test('reader termination before daemon acknowledgement denies readiness', async () => {
  const stream = events();
  const observer = await createEmployeeEvidenceObserver(input, {
    read: reader().read,
    spawnEvents: () => stream.child,
    waitMs: 30,
  });
  const ready = observer.ready(marker);
  stream.child.signalCode = 'SIGTERM';
  stream.child.emit('close', null, 'SIGTERM');
  await assert.rejects(ready, /unavailable/);
  assert.equal((await observer.finish(endId)).observerUncertain, true);
});

for (const drain of [false, undefined, 'true', true])
  test(`cleanup preserves controller drain admission ${String(drain)}`, async (t) => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'employee-start-cleanup-test-')
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const context = {
      source: sourceSha,
      control: controlSha,
      run: '1',
      attempt: '1',
      project: projectId,
      name: input.network.name,
      marker: path.join(root, 'owned.json'),
      receiptDirectory: path.join(root, 'receipts'),
    };
    writeFileSync(context.marker, JSON.stringify(input.network));
    mkdirSync(context.receiptDirectory);
    const receiptPath = path.join(
      context.receiptDirectory,
      'qualification.json'
    );
    const before = {
      sourceSha,
      controlSha,
      networkId: input.network.id,
      schemaQualified: true,
      typesQualified: true,
      networkQualified: true,
      controllerQualified: drain === true,
      startupEvidenceDrained: drain,
      combinedQualified: false,
    };
    writeFileSync(receiptPath, JSON.stringify(before));
    const result = await removeEmployeeNetwork('/synthetic', {
      context,
      runner: async (_command, args) => {
        if (args[0] === 'ps' || args[1] === 'ls') return Buffer.from('');
        if (args[1] === 'rm') {
          assert.equal(args[2], input.network.id);
          return Buffer.from(input.network.id);
        }
        return Buffer.from(
          JSON.stringify([
            {
              Id: input.network.id,
              Name: input.network.name,
              Internal: true,
              Driver: 'bridge',
              Labels: input.network.labels,
              Containers: {},
            },
          ])
        );
      },
    });
    const after = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.equal(result.networkCleanupSucceeded, true);
    assert.equal(after.networkCleanupSucceeded, true);
    for (const key of ['schemaQualified', 'typesQualified', 'networkQualified'])
      assert.equal(after[key], true);
    assert.equal(after.controllerQualified, drain === true);
    assert.equal(after.combinedQualified, drain === true);
    assert.equal(result.combinedQualified, drain === true);
    assert.equal(after.controllerQualified ? 0 : 1, drain === true ? 0 : 1);
  });

test('admission diagnostics accept only literal await stages and never echo private input', () => {
  for (const stage of [
    'worker-initialize',
    'primary-network-ready',
    'worker-network-ready',
    'observer-health',
    'admitted',
  ])
    assert.equal(startupAdmissionDiagnostic(stage), stage);
  for (const stage of [
    'postgres://synthetic-private',
    { stage: 'worker-initialize' },
    undefined,
  ])
    assert.equal(startupAdmissionDiagnostic(stage), 'unknown');
});

// This runs the actual worker module and Linux authority/group guards. Docker is a private
// fixed-response executable fixture, not a real daemon. Non-Linux hosts must report SKIP.
for (const mode of [
  'valid',
  'malformed-network',
  'missing-network',
  'foreign-network',
  'wrong-authority',
  'wrong-group',
]) {
  test(`production worker Linux admission ${mode}`, {
    skip: process.platform !== 'linux',
    timeout: 10000,
  }, async (t) => {
    const root = mkdtempSync(
      path.join(os.tmpdir(), 'employee-production-entry-test-')
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const selected = network();
    if (mode === 'foreign-network') selected.labels.project = 'foreign';
    const rows = [
      markerEvent(marker.id, marker.name),
      markerEvent(endId, 'end'),
    ];
    const script = `#!${process.execPath}
const args = process.argv.slice(2), mode = ${JSON.stringify(mode)};
if (args.includes('events')) {
  process.stdout.write(${JSON.stringify(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)});
  setInterval(() => {}, 1000);
} else if (args.includes('version')) {
  process.stdout.write(${JSON.stringify('28.0.4\n')});
} else if (args.includes('network') && args.includes('inspect')) {
  if (mode === 'missing-network') process.exit(1);
  process.stdout.write(mode === 'malformed-network' ? '{' : ${JSON.stringify(JSON.stringify(selected))});
} else process.exit(1);
`;
    writeFileSync(path.join(root, 'docker'), script, { mode: 0o700 });
    const observer = startEmployeeDbStartEvidence(input, {
      rpcMs: 1000,
      deadlineMs: 5000,
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
        if (mode === 'wrong-group') {
          const send = child.send.bind(child);
          child.send = (message, callback) =>
            send(
              message.type === 'init'
                ? {
                    ...message,
                    value: { ...message.value, groupPid: child.pid + 1 },
                  }
                : message,
              callback
            );
        }
        return child;
      },
    });
    try {
      if (mode === 'valid') {
        await observer.started();
        assert.equal((await observer.ready(marker)).observerReady, true);
      } else await assert.rejects(observer.started(), /unavailable/);
    } finally {
      const result = await observer.finish(endId);
      assert.equal(result.observerDrained, true);
      assert.equal(result.observerReady, mode === 'valid');
      assert.equal(result.observerEndSeen, mode === 'valid');
      assert.equal(result.observerUncertain, mode !== 'valid');
      assert.equal(result.loopbackProbeAttempted, false);
    }
  });
}
