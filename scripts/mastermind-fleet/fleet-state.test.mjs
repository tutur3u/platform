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
      ['[Iris] Orchestrator', 'running'],
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
      ['macstudio1', 'online'],
      ['old-laptop', 'offline'],
    ]
  );
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

test('content hash ignores generatedAt only', () => {
  const rows = readFleetRows(fixtureDatabase(), NOW);
  const a = buildFleetState(rows, { now: NOW });
  const b = buildFleetState(rows, { now: new Date(NOW.getTime() + 60_000) });
  assert.equal(contentHash(a), contentHash(b));
  b.counts.failed = 9;
  assert.notEqual(contentHash(a), contentHash(b));
});
