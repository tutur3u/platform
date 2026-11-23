import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DEFAULT_CAPACITY, PlaygroundAdmission } from './admission.ts';
import {
  CheckAdmission,
  DEFAULT_CHECK_CAPACITY,
  parseCheckCapacity,
} from './check-admission.ts';

function fixture(t, capacity = DEFAULT_CHECK_CAPACITY) {
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
  const runs = new PlaygroundAdmission(storage, DEFAULT_CAPACITY);
  return {
    runs,
    create: () => new CheckAdmission(storage, capacity),
    statements: () => statements,
  };
}

const request = (index, requester = 'user-1', room = 'room-1') => ({
  requestId: `check-${index}`,
  requester,
  room,
});

test('checks share the durable pause with Runs', (t) => {
  const store = fixture(t);
  const checks = store.create();
  assert.deepEqual(checks.admit(request(1), 0), {
    kind: 'refused',
    reason: 'execution_paused',
  });
  store.runs.setEnabled(true);
  assert.deepEqual(checks.admit(request(1), 0), {
    kind: 'admitted',
    admittedAt: 0,
  });
  store.runs.setEnabled(false);
  assert.equal(store.create().admit(request(2), 1).reason, 'execution_paused');
});

test('every attempt is charged, even with a reused request ID', (t) => {
  const store = fixture(t, { ...DEFAULT_CHECK_CAPACITY, perUserPerWindow: 2 });
  store.runs.setEnabled(true);
  const checks = store.create();
  assert.equal(checks.admit(request(1), 0).kind, 'admitted');
  // Replaying the same ID still compiles, so it still costs.
  assert.equal(store.create().admit(request(1), 1).kind, 'admitted');
  assert.equal(checks.admit(request(1), 2).reason, 'check_quota');
  assert.deepEqual(checks.admit(request(1, 'user-2'), 3), {
    kind: 'refused',
    reason: 'request_conflict',
  });
  assert.deepEqual(checks.admit(request(1, 'user-1', 'room-2'), 4), {
    kind: 'refused',
    reason: 'request_conflict',
  });
});

test('recent rooms are the ones a pause must stop, newest first and bounded', (t) => {
  const store = fixture(t);
  store.runs.setEnabled(true);
  const checks = store.create();
  checks.admit(request(1, 'a', 'room-old'), 0);
  checks.admit(request(2, 'b', 'room-a'), 2_200_000);
  checks.admit(request(3, 'c', 'room-b'), 2_200_010);
  checks.admit(request(4, 'd', 'room-a'), 2_200_020);
  assert.deepEqual(checks.recentRooms(2_200_030), ['room-a', 'room-b']);
  assert.deepEqual(checks.recentRooms(2_200_030, 1), ['room-a']);
});

test('rooms without a live guest wait while the live-room cap is full', (t) => {
  const store = fixture(t, { ...DEFAULT_CHECK_CAPACITY, liveRooms: 2 });
  store.runs.setEnabled(true);
  const checks = store.create();
  assert.equal(checks.admit(request(1, 'a', 'room-a'), 0).kind, 'admitted');
  assert.equal(checks.admit(request(2, 'b', 'room-b'), 10).kind, 'admitted');
  assert.deepEqual(checks.admit(request(3, 'c', 'room-c'), 20), {
    kind: 'refused',
    reason: 'check_quota',
    retryAfterMs: 120_000 - 20,
  });
  // A room that already holds a live guest keeps checking.
  assert.equal(checks.admit(request(4, 'a', 'room-a'), 30).kind, 'admitted');
  // Once room-b's guest has idled out, a new room may start one.
  assert.equal(
    checks.admit(request(5, 'c', 'room-c'), 120_011).kind,
    'admitted'
  );
});

test('one person cannot hold more than their share of live rooms', (t) => {
  const store = fixture(t, { ...DEFAULT_CHECK_CAPACITY, liveRoomsPerUser: 2 });
  store.runs.setEnabled(true);
  const checks = store.create();
  assert.equal(checks.admit(request(1, 'a', 'room-1'), 0).kind, 'admitted');
  assert.equal(checks.admit(request(2, 'a', 'room-2'), 10).kind, 'admitted');
  assert.deepEqual(checks.admit(request(3, 'a', 'room-3'), 20), {
    kind: 'refused',
    reason: 'check_quota',
    retryAfterMs: 120_000 - 20,
  });
  assert.equal(checks.admit(request(4, 'a', 'room-1'), 30).kind, 'admitted');
  assert.equal(checks.admit(request(5, 'b', 'room-3'), 40).kind, 'admitted');
});

test('per-user, per-room and daily budgets refuse with the time until they free', (t) => {
  const day = 86_400_000;
  const store = fixture(t, {
    perUserPerWindow: 2,
    perRoomPerWindow: 3,
    perDay: 4,
    liveRooms: 50,
    liveRoomsPerUser: 3,
  });
  store.runs.setEnabled(true);
  const checks = store.create();
  assert.equal(checks.admit(request(1), day).kind, 'admitted');
  assert.equal(checks.admit(request(2), day + 10).kind, 'admitted');
  assert.deepEqual(checks.admit(request(3), day + 20), {
    kind: 'refused',
    reason: 'check_quota',
    retryAfterMs: 600_000 - 20,
  });
  assert.equal(checks.admit(request(4, 'user-2'), day + 30).kind, 'admitted');
  assert.deepEqual(checks.admit(request(5, 'user-3'), day + 40), {
    kind: 'refused',
    reason: 'check_quota',
    retryAfterMs: 600_000 - 40,
  });
  assert.equal(
    checks.admit(request(6, 'user-3', 'room-2'), day + 50).kind,
    'admitted'
  );
  assert.deepEqual(
    store.create().admit(request(7, 'user-4', 'room-3'), day + 60),
    { kind: 'refused', reason: 'check_quota', retryAfterMs: day - 60 }
  );
  // The windows and the day roll over.
  assert.equal(
    checks.admit(request(8, 'user-4', 'room-3'), day * 2).kind,
    'admitted'
  );
});

test('each admission is bounded and prunes expired rows', (t) => {
  const store = fixture(t, {
    ...DEFAULT_CHECK_CAPACITY,
    liveRooms: 100,
    liveRoomsPerUser: 100,
  });
  store.runs.setEnabled(true);
  const checks = store.create();
  for (let index = 0; index < 80; index += 1)
    checks.admit(request(index, `user-${index}`, `room-${index}`), index);
  const before = store.statements();
  assert.equal(
    checks.admit(request('late', 'late', 'late'), 700_000).kind,
    'admitted'
  );
  // gate, conflict, budget, user window, room window, live rooms, insert,
  // budget, prune.
  assert.equal(store.statements() - before, 9);
  const [{ count }] = store.runs['storage'].query(
    'SELECT COUNT(*) AS count FROM playground_checks'
  );
  // Rows outlive the 10-minute window by a guest lifetime.
  assert.equal(count, 81);
  checks.admit(request('later', 'later', 'later'), 35 * 60_000 + 100);
  const [{ count: pruned }] = store.runs['storage'].query(
    'SELECT COUNT(*) AS count FROM playground_checks'
  );
  assert.equal(pruned, 81 - 64 + 1);
});

test('the daily ceiling is configurable only downwards', () => {
  assert.deepEqual(parseCheckCapacity({}), DEFAULT_CHECK_CAPACITY);
  assert.equal(
    parseCheckCapacity({ PLAYGROUND_MAX_CHECKS_PER_UTC_DAY: '500' }).perDay,
    500
  );
  for (const value of ['0', '20001', '1e3', ''])
    assert.throws(() =>
      parseCheckCapacity({ PLAYGROUND_MAX_CHECKS_PER_UTC_DAY: value })
    );
});
