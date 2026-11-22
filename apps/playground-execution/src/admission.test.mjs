import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  DEFAULT_CAPACITY,
  parseCapacity,
  PlaygroundAdmission,
  WRITEBACK_GRACE_MS,
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
    kind: 'existing',
    run,
  });
  assert.deepEqual(
    restarted.reserve({ ...input(1), scopeId: 'other-room' }, 6),
    {
      kind: 'refused',
      reason: 'request_conflict',
    }
  );
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
  // The oldest counted start leaves the 10-minute window first.
  assert.deepEqual(restarted.reserve(input(3, 'same-user'), day), {
    kind: 'refused',
    reason: 'user_rate_limit',
    retryAfterMs: 600_000 - 1,
  });
  for (let index = 3; index <= 5; index += 1) {
    const run = reserve(restarted, input(index), day);
    restarted.finish(run, 'succeeded', day);
  }
  // The daily budget frees at the next UTC midnight, even after a clock reversal.
  assert.deepEqual(restarted.reserve(input(6), day + 1), {
    kind: 'refused',
    reason: 'daily_capacity',
    retryAfterMs: day - 1,
  });
  assert.deepEqual(restarted.reserve(input(6), day - 100), {
    kind: 'refused',
    reason: 'daily_capacity',
    retryAfterMs: day + 100,
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

test('stop waits for the scoped writeback claim across restarts', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.claimWriteback(run, 'claim-1', 2), true);
  assert.equal(ledger.claimWriteback(run, 'claim-2', 3), false);
  ledger.setEnabled(false);
  const restarted = store.create();
  assert.equal(restarted.finish(run, 'cancelled', 4), undefined);
  assert.equal(restarted.active().length, 1);
  assert.equal(restarted.setEnabled(true).enabled, false);
  assert.equal(restarted.settleWriteback(run, 'claim-1', 5), true);
  assert.equal(
    restarted.finish(run, 'succeeded', 6, {
      savedRevision: 2,
      exitCode: 0,
      output: 'late',
    }),
    'cancelled'
  );
  assert.equal(restarted.read(input(1)).result_revision, null);
  assert.equal(restarted.active().length, 0);
  assert.equal(restarted.setEnabled(true).enabled, true);
  const late = reserve(restarted, input(2), 7);
  assert.equal(restarted.claimStart(late, 8), true);
  assert.equal(restarted.claimWriteback(late, 'late', late.deadline), false);
});

test('settlement fences a delayed claim with an unknown response', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.settleWriteback(run, 'unknown', 2), true);
  assert.equal(store.create().claimWriteback(run, 'unknown', 3), false);
  const next = reserve(ledger, input(2));
  assert.equal(ledger.claimStart(next, 4), true);
  assert.equal(ledger.claimWriteback(next, 'owned', 5), true);
  assert.equal(ledger.settleWriteback(next, 'unrelated', 6), false);
  assert.equal(ledger.finish(next, 'cancelled', 7), undefined);
  assert.equal(ledger.settleWriteback(next, 'owned', 8), true);
});

test('expired feedback stays terminal while resource reconciliation continues', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.expireFeedback(run, run.deadline).client_expired, 1);
  assert.equal(ledger.active().length, 1);
  const restarted = store.create();
  assert.equal(
    restarted.finish(run, 'succeeded', run.deadline - 1, {
      exitCode: 0,
      output: 'late',
    }),
    'failed'
  );
  assert.equal(restarted.read(input(1)).output, '');
  assert.equal(restarted.active().length, 0);
});

test('a confirmed checkpoint response finishes a run after lost settlement calls', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.claimWriteback(run, 'claim-1', 2), true);
  const restarted = store.create();
  assert.equal(
    restarted.finish(run, 'succeeded', 3, {
      exitCode: 0,
      output: 'hello',
      savedRevision: 2,
    }),
    'succeeded'
  );
  const receipt = restarted.read(input(1));
  assert.equal(receipt.result_revision, 2);
  assert.equal(receipt.output, 'hello');
  assert.equal(receipt.writeback_state, 2);
  assert.equal(restarted.active().length, 0);
});

test('settlement preserves an acknowledged revision after the export response is lost', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.claimWriteback(run, 'claim-1', 2), true);
  assert.equal(ledger.settleWriteback(run, 'unrelated', 3, 9), false);
  assert.equal(ledger.settleWriteback(run, 'claim-1', 4, 2), true);
  const restarted = store.create();
  assert.equal(restarted.finish(run, 'failed', run.deadline), 'failed');
  assert.equal(restarted.read(input(1)).result_revision, 2);
  assert.equal(restarted.active().length, 0);
});

test('a writeback claim that is never settled releases its slot after the grace', (t) => {
  const store = fixture(t, { ...DEFAULT_CAPACITY, concurrent: 1 });
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1, 'same-user'));
  assert.equal(ledger.claimStart(run, 1), true);
  assert.equal(ledger.claimWriteback(run, 'lost', run.deadline - 1), true);
  // The slot reports without a saved revision and Web never settles.
  assert.equal(ledger.finish(run, 'failed', run.deadline), undefined);
  const grace = run.deadline + WRITEBACK_GRACE_MS;
  const held = ledger.active()[0];
  assert.equal(held.cleanup_at, grace);
  assert.equal(held.cleanup_attempts, 0);
  assert.equal(ledger.claimCleanup(held, grace - 1), false);
  assert.equal(
    ledger.reserve(input(2, 'same-user'), grace - 1).reason,
    'user_busy'
  );
  const restarted = store.create();
  assert.equal(restarted.finish(run, 'failed', grace - 1), undefined);
  assert.equal(restarted.claimCleanup(restarted.active()[0], grace), true);
  assert.equal(restarted.finish(run, 'failed', grace), 'failed');
  const receipt = restarted.read(input(1, 'same-user'));
  assert.equal(receipt.result_revision, null);
  assert.equal(receipt.failure_reason, 'sandbox_failed');
  assert.equal(restarted.active().length, 0);
  // A late settlement cannot reopen the finished row.
  assert.equal(restarted.settleWriteback(run, 'lost', grace + 1, 4), false);
  assert.equal(restarted.setEnabled(false).enabled, false);
  assert.equal(restarted.setEnabled(true).enabled, true);
  reserve(restarted, input(3, 'same-user'), grace + 1);
});

test('repeated Stop requests keep the cleanup backoff and budget', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const run = reserve(ledger, input(1));
  assert.equal(ledger.claimStart(run, 1), true);
  ledger.requestStop(run);
  assert.equal(ledger.claimCleanup(run, 2), true);
  const backoff = ledger.active()[0].cleanup_at;
  assert.equal(backoff, 3002);
  ledger.requestStop(run);
  ledger.requestStop(store.create().active()[0]);
  const after = store.create().active()[0];
  assert.equal(after.cleanup_at, backoff);
  assert.equal(after.cleanup_attempts, 1);
  assert.equal(ledger.claimCleanup(run, 3), false);
});

test('only a service failure records the sandbox_failed reason', (t) => {
  const store = fixture(t);
  const ledger = store.create();
  ledger.setEnabled(true);
  const outcomes = [
    [undefined, 'failed', 'sandbox_failed'],
    [
      { exitCode: 126, output: '', sandboxFailed: true },
      'failed',
      'sandbox_failed',
    ],
    [
      { exitCode: 1, output: 'Traceback', sandboxFailed: false },
      'failed',
      null,
    ],
    [{ exitCode: 0, output: 'ok' }, 'succeeded', null],
  ];
  outcomes.forEach(([result, state, reason], index) => {
    const run = reserve(ledger, input(index + 1), 10 * index);
    assert.equal(ledger.claimStart(run, 10 * index + 1), true);
    assert.equal(ledger.finish(run, state, 10 * index + 2, result), state);
    assert.equal(ledger.read(input(index + 1)).failure_reason, reason);
  });
  const stopped = reserve(ledger, input(9), 100);
  ledger.requestStop(stopped);
  assert.equal(ledger.finish(stopped, 'failed', 101), 'cancelled');
  assert.equal(ledger.read(input(9)).failure_reason, null);
});
