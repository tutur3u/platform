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
      ['skr-m4', 'online', undefined],
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
