import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFleetState, contentHash, readFleetRows } from './fleet-state.mjs';
import { fixtureDatabase } from './fixture.mjs';

const NOW = new Date('2026-11-20T03:00:00.000Z');

test('builds lanes, counts, machines and orchestrator from live rows', () => {
  const state = buildFleetState(readFleetRows(fixtureDatabase(), NOW), {
    now: NOW,
    localMachine: { id: 'skr-m4', label: 'M4' },
  });
  assert.deepEqual(state.counts, {
    running: 2,
    waiting: 0,
    queued: 0,
    idle: 0,
    failed: 1,
    recovered: 0,
    quotaRecovered: 0,
    cancelled: 0,
  });
  assert.deepEqual(
    state.lanes.map((lane) => [lane.title, lane.state]),
    [
      // Stored as the Web scrub leaves it; detection uses the raw title.
      ['Iris Orchestrator', 'running'],
      ['Mobile sync see', 'running'],
      ['CI fix', 'failed'],
    ]
  );
  assert.equal(state.orchestrator.state, 'running');
  assert.match(state.lanes[0].id, /^lane-[0-9a-f]{16}$/);
  assert.equal(state.lanes[1].parentId, state.lanes[0].id);
  assert.equal(state.lanes[1].model, 'gpt-6');
  assert.deepEqual(
    state.machines.map((m) => [m.id, m.status]),
    [
      ['skr-m4', 'online'],
      // Not probed: seen 5 minutes ago through T3's own link traffic.
      ['macstudio1', 'stale'],
      ['old-laptop', 'offline'],
    ]
  );
});

function remoteThread(threadId, state, updatedAt, extra = {}) {
  return { threadId, title: `Lane ${threadId}`, state, updatedAt, ...extra };
}

test('counts lanes on every linked machine under its own slug', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  rows.peers = [
    {
      environment_id: 'env-1',
      label: 'MacStudio1',
      status: 'online',
      lastSeenAt: NOW.toISOString(),
      threads: [
        remoteThread('r-run', 'running', '2026-11-20T02:59:00.000Z', {
          provider: 'codex',
          model: 'gpt-6',
          projectTitle: 'platform',
        }),
        remoteThread('r-child', 'waiting', '2026-11-20T02:58:00.000Z', {
          parentThreadId: 'r-run',
        }),
      ],
    },
    {
      environment_id: 'env-3',
      label: 'Skora Macbook M3 Pro',
      status: 'online',
      lastSeenAt: NOW.toISOString(),
      threads: [
        remoteThread('m3-q', 'queued', '2026-11-20T02:57:00.000Z'),
        remoteThread('m3-f', 'failed', '2026-11-20T01:00:00.000Z'),
        // Already counted from the local database; never twice.
        remoteThread('t-run', 'running', '2026-11-20T02:59:00.000Z'),
      ],
    },
  ];
  const state = buildFleetState(rows, {
    now: NOW,
    localMachine: { id: 'skr-m4', label: 'M4' },
  });
  assert.deepEqual(state.counts, {
    running: 3,
    waiting: 1,
    queued: 1,
    idle: 0,
    failed: 2,
    recovered: 0,
    quotaRecovered: 0,
    cancelled: 0,
  });
  const machineIds = new Set(state.machines.map((m) => m.id));
  for (const lane of state.lanes) assert.ok(machineIds.has(lane.machineId));
  const perMachine = {};
  for (const lane of state.lanes)
    perMachine[lane.machineId] = (perMachine[lane.machineId] ?? 0) + 1;
  assert.deepEqual(perMachine, {
    'skr-m4': 3,
    macstudio1: 2,
    'skora-macbook-m3-pro': 2,
  });
  const remote = state.lanes.find((lane) => lane.title === 'Lane r-run');
  assert.equal(remote.machineId, 'macstudio1');
  assert.equal(remote.project, 'platform');
  assert.equal(
    state.lanes.find((lane) => lane.title === 'Lane r-child').parentId,
    remote.id
  );
  assert.deepEqual(
    state.machines.map((m) => [m.id, m.status, m.lastSeenAt]),
    [
      ['skr-m4', 'online', NOW.toISOString()],
      ['macstudio1', 'online', NOW.toISOString()],
      ['skora-macbook-m3-pro', 'online', NOW.toISOString()],
    ]
  );
  const json = JSON.stringify(state);
  assert.ok(!json.includes('env-3'));
  for (const lane of state.lanes) assert.match(lane.id, /^lane-[0-9a-f]{16}$/);
});

test('caps lanes at 300 keeping running, waiting, queued, failed, then idle', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  const at = (i) => new Date(NOW.getTime() - i * 1000).toISOString();
  rows.peers = [
    {
      environment_id: 'env-1',
      label: 'MacStudio1',
      status: 'online',
      threads: [
        ...Array.from({ length: 320 }, (_, i) =>
          remoteThread(`idle-${i}`, 'idle', at(i))
        ),
        remoteThread('late-wait', 'waiting', at(900)),
        remoteThread('late-q', 'queued', at(901)),
        remoteThread('late-f', 'failed', at(902)),
      ],
    },
  ];
  const state = buildFleetState(rows, { now: NOW });
  assert.equal(state.lanes.length, 300);
  assert.equal(state.counts.idle, 320);
  assert.deepEqual(
    state.lanes.slice(0, 6).map((lane) => lane.state),
    ['running', 'running', 'waiting', 'queued', 'failed', 'failed']
  );
  assert.equal(state.lanes.at(-1).state, 'idle');
});

test('never carries thread ids, message bodies or peer secret names', () => {
  const json = JSON.stringify(
    buildFleetState(readFleetRows(fixtureDatabase(), NOW), { now: NOW })
  );
  for (const forbidden of [
    't-run',
    't-iris',
    'PRIVATE CHAT BODY',
    'kept-out',
    'env-1',
    'https://',
  ])
    assert.ok(!json.includes(forbidden), forbidden);
});

test('reports the orchestrator offline when no lane matches', () => {
  const state = buildFleetState(readFleetRows(fixtureDatabase(), NOW), {
    now: NOW,
    orchestratorPattern: /^\[Nobody\]/,
  });
  assert.equal(state.orchestrator.state, 'offline');
});

test('content hash ignores generatedAt and machine ages only', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  const a = buildFleetState(rows, { now: NOW });
  const b = buildFleetState(rows, { now: new Date(NOW.getTime() + 60_000) });
  assert.equal(contentHash(a), contentHash(b));
  b.machines[1].lastSeenAt = NOW.toISOString();
  assert.equal(contentHash(a), contentHash(b));
  b.machines[1].status = 'offline';
  assert.notEqual(contentHash(a), contentHash(b));
  b.machines[1].status = a.machines[1].status;
  b.counts.failed = 9;
  assert.notEqual(contentHash(a), contentHash(b));
});

test('keeps colliding machine labels apart and prefers live rows', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  rows.peers = [
    {
      environment_id: 'env-a',
      label: 'Studio',
      status: 'stale',
      live: false,
      threads: [remoteThread('shared', 'running', '2026-11-20T02:00:00.000Z')],
    },
    {
      environment_id: 'env-b',
      label: 'studio',
      status: 'online',
      live: true,
      threads: [remoteThread('shared', 'idle', '2026-11-20T02:59:00.000Z')],
    },
  ];
  const state = buildFleetState(rows, { now: NOW });
  const ids = state.machines.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[1], 'studio');
  assert.match(ids[2], /^studio-[0-9a-f]{8}$/);
  const shared = state.lanes.filter((lane) => lane.title === 'Lane shared');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].machineId, ids[2]);
  assert.equal(shared[0].state, 'idle');
});

test('orders equal lanes the same way whatever order they arrive in', () => {
  const peer = (threads) => [
    { environment_id: 'env-1', label: 'MacStudio1', status: 'online', threads },
  ];
  const at = '2026-11-20T02:59:00.000Z';
  const list = ['x', 'y', 'z'].map((id) => remoteThread(id, 'running', at));
  const a = buildFleetState(
    { ...readFleetRows(fixtureDatabase(), NOW), peers: peer(list) },
    { now: NOW }
  );
  const b = buildFleetState(
    {
      ...readFleetRows(fixtureDatabase(), NOW),
      peers: peer([...list].reverse()),
    },
    { now: NOW }
  );
  assert.deepEqual(a.lanes, b.lanes);
  assert.equal(contentHash(a), contentHash(b));
});

test('retries a hashed machine id that is already taken', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  const peers = [
    { environment_id: 'env-a', label: 'Studio', threads: [] },
    { environment_id: 'env-b', label: 'Studio', threads: [] },
  ];
  const clash = buildFleetState({ ...rows, peers }, { now: NOW }).machines[2]
    .id;
  const state = buildFleetState(
    { ...rows, peers },
    { now: NOW, localMachine: { id: clash, label: 'Local' } }
  );
  const ids = state.machines.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('leaves side chats out locally, as T3 lists them on peers', () => {
  const db = fixtureDatabase();
  db.prepare(
    'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, NULL, ?)'
  ).run(
    't-side',
    'p1',
    'Side chat',
    '2026-11-20T02:59:30.000Z',
    null,
    JSON.stringify({ lineage: { sideChat: true, parentThreadId: 't-iris' } })
  );
  db.prepare(
    'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'r-side',
    't-side',
    1,
    'codex',
    'running',
    '2026-11-20T02:59:00.000Z',
    null,
    '{}'
  );
  const state = buildFleetState(readFleetRows(db, NOW), { now: NOW });
  assert.equal(state.counts.running, 2);
  assert.ok(!state.lanes.some((lane) => lane.title === 'Side chat'));
});

test('counts active threads a peer has past its lane cap', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  rows.peers = [
    {
      environment_id: 'env-1',
      label: 'MacStudio1',
      status: 'online',
      live: true,
      extraCounts: { running: 5, queued: 2, bogus: 9 },
      threads: [remoteThread('r1', 'running', '2026-11-20T02:59:00.000Z')],
    },
  ];
  const state = buildFleetState(rows, { now: NOW });
  assert.equal(state.counts.running, 2 + 1 + 5);
  assert.equal(state.counts.queued, 2);
});

test('keeps per-machine active totals from before the lane cap', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  const at = (i) => new Date(NOW.getTime() - i * 1000).toISOString();
  rows.peers = ['A', 'B'].map((label) => ({
    environment_id: `env-${label}`,
    label: `Studio ${label}`,
    status: 'online',
    live: true,
    extraCounts: { running: 3 },
    threads: Array.from({ length: 151 }, (_, i) =>
      remoteThread(`${label}-${i}`, 'running', at(i))
    ),
  }));
  const state = buildFleetState(rows, { now: NOW });
  assert.equal(state.lanes.length, 300);
  assert.equal(state.machineActive['studio-a'], 154);
  assert.equal(state.machineActive['studio-b'], 154);
  assert.ok(!JSON.stringify(state).includes('machineActive'));
});

test('splits recovered, quota-recovered and cancelled lanes out of failed', () => {
  const db = fixtureDatabase();
  const thread = db.prepare(
    'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, NULL, ?)'
  );
  const run = db.prepare(
    'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const at = (m) => `2026-11-20T0${m}:00:00.000Z`;
  for (const [id, title] of [
    ['t-retry', 'Retried on the same thread'],
    ['t-quota', 'Resumed after a usage limit'],
    ['t-stop', 'Cancelled by its parent'],
    ['t-cal', 'Ship the calendar sync worker'],
    ['t-manual', 'Finished by a manual retry'],
  ])
    thread.run(id, 'p1', title, at(2), null, '{}');
  run.run('rr1', 't-retry', 1, 'codex', 'failed', at(1), at(1), '{}');
  run.run('rr2', 't-retry', 2, 'codex', 'completed', at(1), at(2), '{}');
  run.run('rq1', 't-quota', 1, 'codex', 'failed', at(1), at(1), '{}');
  run.run(
    'rq2',
    't-quota',
    2,
    'codex',
    'completed',
    at(1),
    at(2),
    JSON.stringify({ usageLimitContinuationOfRunId: 'rq1' })
  );
  run.run('rs1', 't-stop', 1, 'codex', 'interrupted', at(1), at(2), '{}');
  run.run('rc1', 't-cal', 1, 'codex', 'failed', at(1), at(2), '{}');
  // A quota continuation that failed, then a manual retry that finished:
  // the finishing run decides, so this is a plain recovery.
  run.run('rm1', 't-manual', 1, 'codex', 'failed', at(1), at(1), '{}');
  run.run(
    'rm2',
    't-manual',
    2,
    'codex',
    'failed',
    at(1),
    at(1),
    JSON.stringify({ usageLimitContinuationOfRunId: 'rm1' })
  );
  run.run('rm3', 't-manual', 3, 'codex', 'completed', at(1), at(2), '{}');
  const rows = readFleetRows(db, NOW);
  rows.peers = [
    {
      environment_id: 'env-1',
      label: 'MacStudio1',
      status: 'online',
      threads: [
        remoteThread('dup', 'idle', at(2), { resolution: 'cancelled' }),
        {
          ...remoteThread('again', 'running', at(3), {
            projectTitle: 'tuturuuu',
          }),
          title: 'Ship the calendar sync worker (retry)',
        },
      ],
    },
  ];
  const state = buildFleetState(rows, { now: NOW });
  // The calendar failure is superseded by the peer's later retry; the
  // fixture's "CI fix" failure has no successor and still counts.
  assert.equal(state.counts.failed, 1);
  assert.equal(state.counts.recovered, 3);
  assert.equal(state.counts.quotaRecovered, 1);
  assert.equal(state.counts.cancelled, 2);
  const byTitle = Object.fromEntries(
    state.lanes.map((lane) => [lane.title, [lane.state, lane.resolution]])
  );
  assert.deepEqual(byTitle['CI fix'], ['failed', undefined]);
  assert.deepEqual(byTitle['Ship the calendar sync worker'], [
    'idle',
    'recovered',
  ]);
  assert.deepEqual(byTitle['Resumed after a usage limit'], [
    'idle',
    'quotaRecovered',
  ]);
  assert.deepEqual(byTitle['Cancelled by its parent'], ['idle', 'cancelled']);
  assert.deepEqual(byTitle['Finished by a manual retry'], [
    'idle',
    'recovered',
  ]);
});

test('orders attempts by when their runs ended, and rollbacks never recover', () => {
  const db = fixtureDatabase();
  const thread = db.prepare(
    'INSERT INTO orchestration_v2_projection_threads VALUES (?, ?, ?, ?, ?, NULL, ?)'
  );
  const run = db.prepare(
    'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const at = (h) => `2026-11-20T0${h}:00:00.000Z`;
  // Finished at 01:00 but touched at 02:30; its retry failed at 02:00.
  thread.run(
    'x-done',
    'p1',
    'Ship the calendar sync worker',
    '2026-11-20T02:30:00.000Z',
    null,
    '{}'
  );
  run.run('d1', 'x-done', 1, 'codex', 'completed', at(0), at(1), '{}');
  thread.run(
    'x-fail',
    'p1',
    'Ship the calendar sync worker (retry)',
    at(2),
    null,
    '{}'
  );
  run.run('f1', 'x-fail', 1, 'codex', 'failed', at(1), at(2), '{}');
  // A failure followed by a rolled-back retry stays a failure.
  thread.run(
    'x-mail',
    'p1',
    'Move the mail worker to queues',
    at(1),
    null,
    '{}'
  );
  run.run('m1', 'x-mail', 1, 'codex', 'failed', at(0), at(1), '{}');
  thread.run(
    'x-mail2',
    'p1',
    'Move the mail worker to queues (retry)',
    at(2),
    null,
    '{}'
  );
  run.run('m2', 'x-mail2', 1, 'codex', 'rolled_back', at(1), at(2), '{}');
  const state = buildFleetState(readFleetRows(db, NOW), { now: NOW });
  const byTitle = Object.fromEntries(
    state.lanes.map((lane) => [lane.title, [lane.state, lane.resolution]])
  );
  assert.deepEqual(byTitle['Ship the calendar sync worker (retry)'], [
    'failed',
    undefined,
  ]);
  assert.deepEqual(byTitle['Move the mail worker to queues'], [
    'failed',
    undefined,
  ]);
  assert.deepEqual(byTitle['Move the mail worker to queues (retry)'], [
    'idle',
    'cancelled',
  ]);
});
