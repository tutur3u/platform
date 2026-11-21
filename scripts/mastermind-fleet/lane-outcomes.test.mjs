import assert from 'node:assert/strict';
import { test } from 'node:test';
import { laneStem, sameWork, supersedeFailures } from './lane-outcomes.mjs';

const entry = (id, title, state, updatedAt, extra = {}) => ({
  title,
  lane: { id, state, updatedAt, ...extra },
});

test('reads retries, rounds and re- prefixes as the same work', () => {
  const same = (a, b) => sameWork(laneStem(a), laneStem(b));
  assert.ok(
    same(
      'Re-review mobile store commit round 3',
      'Re-review mobile store commit round 4'
    )
  );
  assert.ok(
    same(
      'Final review Meet media stack',
      'Final review Meet media stack (retry, codex)'
    )
  );
  assert.ok(
    same(
      '[Rex] Upskii S3 route speed (M3 Pro)',
      'Upskii S3 route speed (retry, M3 Pro)'
    )
  );
  // Different wording is not provably the same work; it stays a failure.
  assert.equal(
    same(
      "Migrate ALL apps' Cloudflare publishing from the old CLI to cf",
      "Migrate ALL apps' Cloudflare publishing to cf (retry, codex)"
    ),
    false
  );
});

test('keeps numbered slices and short titles apart', () => {
  const same = (a, b) => sameWork(laneStem(a), laneStem(b));
  assert.equal(
    same('Review Admin Costs page slice 3', 'Review Admin Costs page slice 4'),
    false
  );
  assert.equal(same('Fix CI', 'Fix CI retry'), false);
  assert.equal(
    same(
      'Review Admin Costs page (slice 3)',
      'Review Admin Costs page (slice 4)'
    ),
    false
  );
  assert.equal(
    same('Ship the R2 media bucket policy', 'Ship the R3 media bucket policy'),
    false
  );
  assert.equal(same('Ship calendar sync', 'Ship calendar sync worker'), false);
  assert.equal(
    same(
      'Tasks paginated fetching',
      'Tasks paginated fetching and perf budgets for the board'
    ),
    false
  );
});

test('a later success recovers a failed lane, a later failure makes it a duplicate', () => {
  const entries = [
    entry(
      'a',
      'Review mobile store commit',
      'failed',
      '2026-11-20T01:00:00.000Z'
    ),
    entry(
      'b',
      'Re-review mobile store commit round 2',
      'failed',
      '2026-11-20T02:00:00.000Z'
    ),
    entry(
      'c',
      'Re-review mobile store commit round 3',
      'idle',
      '2026-11-20T03:00:00.000Z'
    ),
    entry(
      'd',
      'Ship the calendar sync worker',
      'failed',
      '2026-11-20T01:00:00.000Z'
    ),
    entry(
      'e',
      'Ship the calendar sync worker (retry)',
      'failed',
      '2026-11-20T02:00:00.000Z'
    ),
    entry(
      'f',
      'Lonely failure in production deploy',
      'failed',
      '2026-11-20T02:00:00.000Z'
    ),
  ];
  supersedeFailures(entries);
  assert.deepEqual(
    entries.map(({ lane }) => [lane.id, lane.state, lane.resolution]),
    [
      ['a', 'idle', 'recovered'],
      ['b', 'idle', 'recovered'],
      ['c', 'idle', undefined],
      ['d', 'idle', 'cancelled'],
      ['e', 'failed', undefined],
      ['f', 'failed', undefined],
    ]
  );
});

test('an earlier lane or another project never supersedes a failure', () => {
  const entries = [
    entry(
      'a',
      'Ship the calendar sync worker',
      'idle',
      '2026-11-20T01:00:00.000Z'
    ),
    entry(
      'b',
      'Ship the calendar sync worker',
      'failed',
      '2026-11-20T02:00:00.000Z',
      { project: 'platform' }
    ),
    entry(
      'c',
      'Ship the calendar sync worker',
      'running',
      '2026-11-20T03:00:00.000Z',
      { project: 'upskii' }
    ),
  ];
  supersedeFailures(entries);
  assert.equal(entries[1].lane.state, 'failed');
});

test('a missing project, a tie or a near title never clears a failure', () => {
  const at = (h) => `2026-11-20T0${h}:00:00.000Z`;
  const entries = [
    entry('a', 'Review the mobile store commit', 'failed', at(1), {
      project: 'platform',
    }),
    entry('b', 'Review the mobile store commit', 'idle', at(2)),
    entry('c', 'Ship calendar sync', 'failed', at(1)),
    entry('d', 'Ship calendar sync worker', 'failed', at(2)),
    entry('e', 'Ship calendar sync worker job', 'idle', at(3)),
    entry('f', 'Tie on the same timestamp here', 'failed', at(4)),
    entry('g', 'Tie on the same timestamp here', 'idle', at(4)),
  ];
  supersedeFailures(entries);
  assert.deepEqual(
    entries.map(({ lane }) => [lane.id, lane.state]),
    [
      ['a', 'failed'],
      ['b', 'idle'],
      ['c', 'failed'],
      ['d', 'failed'],
      ['e', 'idle'],
      ['f', 'failed'],
      ['g', 'idle'],
    ]
  );
});

test('a cancelled follow-up or an unresolved project never clears a failure', () => {
  const at = (h) => `2026-11-20T0${h}:00:00.000Z`;
  const entries = [
    entry('a', 'Ship the calendar sync worker', 'failed', at(1)),
    entry('b', 'Ship the calendar sync worker (retry)', 'idle', at(2), {
      resolution: 'cancelled',
    }),
    {
      ...entry('c', 'Review the mobile store commit', 'failed', at(1)),
      projectKey: 'unknown:studio:p-a',
    },
    {
      ...entry('d', 'Review the mobile store commit', 'idle', at(2)),
      projectKey: 'unknown:studio:p-b',
    },
  ];
  supersedeFailures(entries);
  assert.equal(entries[0].lane.state, 'failed');
  assert.equal(entries[2].lane.state, 'failed');
});
