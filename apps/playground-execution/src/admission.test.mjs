import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  DEFAULT_CAPACITY,
  parseCapacity,
  PlaygroundAdmission,
} from './admission.ts';

function fixture(t, capacity = DEFAULT_CAPACITY) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let statements = 0;
  const storage = {
    query(sql, ...params) {
      statements += 1;
      return db
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row }));
    },
    transaction(callback) {
      db.exec('BEGIN');
      try {
        const result = callback();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {
    create: () => new PlaygroundAdmission(storage, capacity),
    statements: () => statements,
  };
}

function input(
  index,
  requester = `user-${index}`,
  projectId = `project-${index}`
) {
  return {
    runId: `run-${index}`,
    requester,
    projectId,
    scopeId: 'room-1',
    revision: 1,
  };
}

function reserve(ledger, request, now = 0) {
  const result = ledger.reserve(request, now);
  assert.equal(result.kind, 'new');
  return result.run;
}

test('defaults are configurable only within the approved ceilings', () => {
  assert.deepEqual(parseCapacity({}), {
    concurrent: 20,
    concurrentPerActor: 1,
    perActorPerWindow: 30,
    startsPerDay: 5000,
  });
  assert.equal(parseCapacity({ PLAYGROUND_MAX_CONCURRENT: '4' }).concurrent, 4);
  for (const candidate of ['0', '21', '8.0', '-1', '2e1']) {
    assert.throws(() =>
      parseCapacity({ PLAYGROUND_MAX_CONCURRENT: candidate })
    );
  }
});

test('reserves 20 unique slots and refuses per-user and shared-project overlap', (t) => {
  const ledger = fixture(t).create();
  assert.deepEqual(ledger.reserve(input(0), 0), {
    kind: 'refused',
    reason: 'execution_paused',
  });
  ledger.setEnabled(true);
  const first = reserve(ledger, input(0));
  assert.deepEqual(ledger.reserve(input(1, first.requester), 0), {
    kind: 'refused',
    reason: 'user_busy',
  });
  assert.deepEqual(
    ledger.reserve(input(1, 'another-participant', first.project_id), 0),
    {
      kind: 'refused',
      reason: 'project_busy',
    }
  );
  for (let index = 1; index < 20; index += 1) reserve(ledger, input(index));
  assert.deepEqual(
    ledger.active().map(({ slot }) => slot),
    Array.from({ length: 20 }, (_, i) => i)
  );
  assert.deepEqual(ledger.reserve(input(20), 60_000), {
    kind: 'refused',
    reason: 'global_capacity',
  });
  assert.equal(ledger.finish(first, 'failed', 60_001), 'failed');
  assert.equal(reserve(ledger, input(20), 60_002).slot, first.slot);
});

test('deduplicates after restart and limits each reservation to seven statements', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const before = store.statements();
  const run = reserve(ledger, input(1));
  assert.equal(store.statements() - before, 7);
  const restarted = store.create();
  let count = store.statements();
  assert.deepEqual(restarted.reserve(input(1), 5), { kind: 'existing', run });
  assert.equal(store.statements() - count, 1);
  assert.deepEqual(restarted.reserve({ ...input(1), revision: 2 }, 6), {
    kind: 'refused',
    reason: 'request_conflict',
  });
  count = store.statements();
  assert.equal(
    restarted.read({ ...input(1), scopeId: 'room-elsewhere' }),
    undefined
  );
  assert.deepEqual(restarted.read(input(1)), run);
  assert.equal(store.statements() - count, 2);
  assert.equal(restarted.claimStart(run, 7), true);
  assert.equal(store.create().claimStart(run, 8), false);
});

test('daily count and rolling user count survive restarts and advance at their boundaries', (t) => {
  const day = 86_400_000;
  const store = fixture(t, {
    ...DEFAULT_CAPACITY,
    startsPerDay: 3,
    perActorPerWindow: 2,
  });
  const ledger = store.create();
  ledger.setEnabled(true);
  for (let index = 1; index <= 2; index += 1) {
    const run = reserve(ledger, input(index, 'same-user'), day - 1);
    ledger.finish(run, 'succeeded', day - 1);
  }
  const restarted = store.create();
  assert.deepEqual(restarted.reserve(input(3, 'same-user'), day), {
    kind: 'refused',
    reason: 'user_rate_limit',
  });
  for (let index = 3; index <= 5; index += 1) {
    const run = reserve(restarted, input(index), day);
    restarted.finish(run, 'succeeded', day);
  }
  assert.deepEqual(restarted.reserve(input(6), day + 1), {
    kind: 'refused',
    reason: 'daily_capacity',
  });
  assert.deepEqual(restarted.reserve(input(6), day - 100), {
    kind: 'refused',
    reason: 'daily_capacity',
  });
  reserve(restarted, input(7, 'same-user'), day * 2);
});

test('disable fences stale starts and completions across a restart and expiry', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  const initial = ledger.setEnabled(true);
  const starting = reserve(ledger, input(1));
  const reserved = reserve(ledger, input(2));
  assert.equal(ledger.claimStart(starting, 0), true);
  assert.deepEqual(ledger.setEnabled(false), {
    enabled: false,
    generation: initial.generation + 1,
  });
  const restarted = store.create();
  assert.equal(restarted.setEnabled(true).enabled, false);
  assert.equal(restarted.claimStart(reserved, 10), false);
  assert.equal(restarted.finish(starting, 'succeeded', 20), 'cancelled');
  assert.equal(restarted.finish(starting, 'succeeded', 21), undefined);
  assert.equal(restarted.finish(reserved, 'failed', 22), 'cancelled');
  assert.equal(restarted.setEnabled(true).enabled, true);
  assert.equal(restarted.claimStart(reserved, 23), false);
  const expires = reserve(restarted, input(3), 24);
  assert.equal(restarted.claimStart(expires, expires.deadline), false);
  assert.equal(restarted.active().length, 1);
  assert.equal(restarted.finish(expires, 'failed', expires.deadline), 'failed');
  assert.equal(restarted.active().length, 0);
});

test('per-run Stop denies execution and suppresses late results', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.mayExecute(run, 2), true);
  ledger.requestStop(run);
  const restarted = store.create();
  assert.equal(restarted.mayExecute(run, 3), false);
  assert.equal(
    restarted.finish(run, 'succeeded', 4, { exitCode: 0, output: 'late' }),
    'cancelled'
  );
  assert.equal(restarted.read(input(1)).output, '');
});

test('cleanup exhausts its persisted budget without reopening the slot', (t) => {
  const store = fixture(t, { ...DEFAULT_CAPACITY, concurrent: 1 });
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimCleanup(run, run.deadline - 1), false);
  assert.equal(ledger.claimCleanup(run, run.deadline), true);
  assert.equal(store.create().claimCleanup(run, run.deadline + 1), false);
  assert.equal(store.create().claimCleanup(run, run.deadline + 3000), true);
  assert.equal(store.create().claimCleanup(run, run.deadline + 9000), true);
  const restarted = store.create();
  assert.equal(restarted.claimCleanup(run, run.deadline + 30_000), false);
  assert.equal(restarted.active()[0].cleanup_at, null);
  assert.deepEqual(restarted.reserve(input(2), run.deadline + 30_000), {
    kind: 'refused',
    reason: 'global_capacity',
  });
});
