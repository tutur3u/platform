import { DatabaseSync } from 'node:sqlite';
import { GUARD_SIGNATURE_MAX_SKEW_MS } from '@tuturuuu/utils/abuse-guard/crypto';
import {
  GUARD_OPERATION_RETENTION_MS,
  type ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { describe, expect, it } from 'vite-plus/test';
import {
  ALARM_PURGE_LIMIT,
  createGuardEngine,
  type GuardOperation,
  planCleanup,
  planCleanupRetry,
  type SqlRunner,
  shouldRearm,
} from './engine';

const K = (name: string) => name.padEnd(43, '_').slice(0, 43);

function setup() {
  const db = new DatabaseSync(':memory:');
  let writes = 0;
  const sql: SqlRunner = {
    exec(query, ...bindings) {
      if (/^\s*(INSERT|DELETE|UPDATE)/iu.test(query)) writes += 1;
      const statement = db.prepare(query);
      return {
        toArray: () =>
          statement.all(...(bindings as (string | number | null)[])) as never,
      };
    },
  };
  const engine = createGuardEngine(sql);
  const runOp = (
    now: number,
    operation: GuardOperation | undefined,
    ...cmds: ParsedGuardCommand[]
  ) => {
    db.exec('BEGIN');
    try {
      const results = engine.run(cmds, now, operation);
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const run = (now: number, ...cmds: ParsedGuardCommand[]) =>
    runOp(now, undefined, ...cmds);
  return { engine, run, runOp, db, writes: () => writes };
}

const minute = (algo: 'fixed' | 'sliding', limit: number, name = 'm') => ({
  k: K(name),
  limit,
  windowMs: 60_000,
  algo,
});

describe('win.hit', () => {
  it('denies at the limit without charging the denied request', () => {
    const { run } = setup();
    const hit = (now: number) =>
      run(now, { op: 'win.hit', windows: [minute('fixed', 2)] })[0];
    expect(hit(1000)).toMatchObject({ ok: true, windows: [{ remaining: 1 }] });
    expect(hit(2000)).toMatchObject({ ok: true, windows: [{ remaining: 0 }] });
    expect(hit(3000)).toMatchObject({ ok: false, resetAt: 60_000 });
    expect(hit(4000)).toMatchObject({ ok: false });
    // A new fixed window starts empty.
    expect(hit(60_000)).toMatchObject({
      ok: true,
      windows: [{ remaining: 1 }],
    });
  });

  it('weights the previous bucket for sliding windows', () => {
    const { run } = setup();
    const hit = (now: number) =>
      run(now, { op: 'win.hit', windows: [minute('sliding', 4)] })[0];
    for (const at of [50_000, 51_000, 52_000, 53_000]) {
      expect(hit(at)).toMatchObject({ ok: true });
    }
    // 15s into the next window, 75% of the 4 previous hits still count (3).
    expect(hit(75_000)).toMatchObject({
      ok: true,
      windows: [{ remaining: 0 }],
    });
    expect(hit(75_000)).toMatchObject({ ok: false });
    // 45s in, only 25% (1) of the previous bucket counts.
    expect(hit(105_000)).toMatchObject({ ok: true });
  });

  it('is all-or-nothing across windows', () => {
    const { run } = setup();
    const both = (now: number) =>
      run(now, {
        op: 'win.hit',
        windows: [
          minute('sliding', 10, 'minute'),
          {
            k: K('hour'),
            limit: 1,
            windowMs: 3_600_000,
            algo: 'sliding',
          },
        ],
      })[0];
    expect(both(1000)).toMatchObject({ ok: true });
    expect(both(2000)).toMatchObject({ ok: false, resetAt: 3_600_000 });
    // The minute window was not charged by the denial: 9 remain, not 8.
    expect(
      run(3000, {
        op: 'win.hit',
        windows: [minute('sliding', 10, 'minute')],
      })[0]
    ).toMatchObject({ ok: true, windows: [{ remaining: 8 }] });
  });
});

describe('kv commands', () => {
  it('implements SET NX / XX / keepTtl with expiry', () => {
    const { run } = setup();
    const set = (
      now: number,
      mode: 'always' | 'nx' | 'xx',
      v = 'a',
      keepTtl?: boolean
    ) =>
      run(now, {
        op: 'kv.set',
        k: K('c'),
        v,
        ttlMs: 900_000,
        mode,
        keepTtl,
      })[0];
    expect(set(0, 'xx')).toEqual({ op: 'kv.set', set: false });
    expect(set(0, 'nx')).toEqual({ op: 'kv.set', set: true });
    expect(set(1, 'nx', 'b')).toEqual({ op: 'kv.set', set: false });
    expect(set(10_000, 'xx', 'c', true)).toEqual({ op: 'kv.set', set: true });
    expect(run(10_000, { op: 'kv.ttl', k: K('c') })[0]).toEqual({
      op: 'kv.ttl',
      ttlMs: 890_000,
    });
    expect(run(899_999, { op: 'kv.get', k: K('c') })[0]).toEqual({
      op: 'kv.get',
      v: 'c',
    });
    // Expired clearance is absent, and NX can claim it again.
    expect(run(900_000, { op: 'kv.get', k: K('c') })[0]).toEqual({
      op: 'kv.get',
      v: null,
    });
    expect(run(900_000, { op: 'kv.ttl', k: K('c') })[0]).toEqual({
      op: 'kv.ttl',
      ttlMs: -2,
    });
    expect(set(900_000, 'nx')).toEqual({ op: 'kv.set', set: true });
  });

  it('applies the incr TTL only on create and counts deletes', () => {
    const { run } = setup();
    const incr = (now: number, by = 1) =>
      run(now, { op: 'kv.incr', k: K('n'), by, ttlMsOnCreate: 60_000 })[0];
    expect(incr(0)).toEqual({ op: 'kv.incr', n: 1, ttlMs: 60_000 });
    expect(incr(30_000)).toEqual({ op: 'kv.incr', n: 2, ttlMs: 30_000 });
    expect(incr(30_000, -5)).toEqual({ op: 'kv.incr', n: -3, ttlMs: 30_000 });
    expect(run(30_000, { op: 'kv.expire', k: K('n'), ttlMs: 5000 })[0]).toEqual(
      { op: 'kv.expire', set: true }
    );
    expect(run(36_000, { op: 'kv.expire', k: K('n'), ttlMs: 5000 })[0]).toEqual(
      { op: 'kv.expire', set: false }
    );
    expect(incr(36_000)).toEqual({ op: 'kv.incr', n: 1, ttlMs: 60_000 });
    expect(run(36_000, { op: 'kv.del', k: K('n') })[0]).toEqual({
      op: 'kv.del',
      n: 1,
    });
    expect(run(36_000, { op: 'kv.del', k: K('n') })[0]).toEqual({
      op: 'kv.del',
      n: 0,
    });
  });

  it('rolls back a step whose value is not an integer', () => {
    const { run } = setup();
    run(0, {
      op: 'kv.set',
      k: K('s'),
      v: 'text',
      ttlMs: 60_000,
      mode: 'always',
    });
    expect(() =>
      run(
        0,
        { op: 'kv.set', k: K('t'), v: 'kept?', ttlMs: 60_000, mode: 'always' },
        { op: 'kv.incr', k: K('s'), by: 1, ttlMsOnCreate: 60_000 }
      )
    ).toThrow('not an integer');
    expect(run(0, { op: 'kv.get', k: K('t') })[0]).toEqual({
      op: 'kv.get',
      v: null,
    });
  });
});

describe('res.reserve / res.refund', () => {
  const WINDOW = 15 * 60 * 1000;
  const reserve = (
    receipt: string,
    sourceLimit = 3,
    targetLimit = 2
  ): ParsedGuardCommand => ({
    op: 'res.reserve',
    budgets: [
      { k: K('source'), limit: sourceLimit, ttlMs: WINDOW },
      { k: K('target'), limit: targetLimit, ttlMs: WINDOW },
    ],
    receipt: K(receipt),
  });
  const refund = (receipt: string): ParsedGuardCommand => ({
    op: 'res.refund',
    receipt: K(receipt),
    target: K('target'),
  });

  it('reserves every budget together and denies without allocating', () => {
    const { run } = setup();
    expect(run(0, reserve('r1'))[0]).toEqual({
      op: 'res.reserve',
      ok: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(run(1000, reserve('r2'))[0]).toMatchObject({
      ok: true,
      remaining: 0,
    });
    expect(run(2000, reserve('r3'))[0]).toEqual({
      op: 'res.reserve',
      ok: false,
      remaining: 0,
      retryAfterMs: WINDOW - 2000,
    });
    // The denial charged neither budget: the source still has one unit.
    expect(run(2000, { op: 'kv.get', k: K('source') })[0]).toEqual({
      op: 'kv.get',
      v: '2',
    });
    // A source-denied attempt never allocates a fresh target key.
    const { run: fresh } = setup();
    fresh(0, { op: 'kv.incr', k: K('source'), by: 3, ttlMsOnCreate: WINDOW });
    expect(fresh(0, reserve('x'))[0]).toMatchObject({ ok: false });
    expect(fresh(0, { op: 'kv.ttl', k: K('target') })[0]).toEqual({
      op: 'kv.ttl',
      ttlMs: -2,
    });
  });

  it('refunds only its own reservation, once', () => {
    const { run } = setup();
    run(0, reserve('r1'));
    run(0, reserve('r2'));
    expect(run(1000, refund('r1'))[0]).toEqual({ op: 'res.refund', n: 1 });
    expect(run(1000, refund('r1'))[0]).toEqual({ op: 'res.refund', n: 0 });
    expect(run(1000, refund('never'))[0]).toEqual({ op: 'res.refund', n: 0 });
    // The receipt expires with its window; a late refund cannot erase a new one.
    run(WINDOW, reserve('r3'));
    expect(run(WINDOW, refund('r2'))[0]).toEqual({ op: 'res.refund', n: 0 });
    expect(run(WINDOW, { op: 'kv.get', k: K('target') })[0]).toEqual({
      op: 'kv.get',
      v: '1',
    });
  });

  it('never admits more reservations than the limit', () => {
    const { run } = setup();
    let admitted = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [result] = run(attempt, reserve(`r${attempt}`, 300, 10));
      if (result?.op === 'res.reserve' && result.ok) admitted += 1;
    }
    expect(admitted).toBe(10);
  });
});

describe('operation dedupe', () => {
  const reserve: ParsedGuardCommand = {
    op: 'res.reserve',
    budgets: [{ k: K('target'), limit: 2, ttlMs: 900_000 }],
    receipt: K('receipt'),
  };
  const op = { key: 'op:replayed-operation-id-0001:0', hash: 'h1' };

  it('never double-charges a reserve, refund or window replay', () => {
    const db = setup();
    const once = (now: number, cmd: ParsedGuardCommand, key: string) =>
      db.runOp(now, { key, hash: JSON.stringify(cmd) }, cmd);
    const a = once(0, reserve, op.key);
    const b = once(30_000, reserve, op.key);
    expect(b).toEqual(a);
    expect(db.run(30_000, { op: 'kv.get', k: K('target') })[0]).toEqual({
      op: 'kv.get',
      v: '1',
    });

    const refund: ParsedGuardCommand = {
      op: 'res.refund',
      receipt: K('receipt'),
      target: K('target'),
    };
    expect(once(31_000, refund, 'op:refund-operation-id-00001:0')).toEqual([
      { op: 'res.refund', n: 0 },
    ]);
    // Replaying the refund or the original reserve cannot re-reserve.
    expect(once(32_000, refund, 'op:refund-operation-id-00001:0')).toEqual([
      { op: 'res.refund', n: 0 },
    ]);
    expect(once(33_000, reserve, op.key)).toEqual(a);
    expect(db.run(33_000, { op: 'kv.get', k: K('target') })[0]).toEqual({
      op: 'kv.get',
      v: '0',
    });

    const hit: ParsedGuardCommand = {
      op: 'win.hit',
      windows: [minute('fixed', 1, 'w')],
    };
    expect(
      once(34_000, hit, 'op:window-operation-id-00001:0')[0]
    ).toMatchObject({ ok: true });
    expect(
      once(35_000, hit, 'op:window-operation-id-00001:0')[0]
    ).toMatchObject({ ok: true });
  });

  it('rejects an operation id reused with different commands', () => {
    const db = setup();
    db.runOp(0, { key: op.key, hash: 'h1' }, reserve);
    expect(() => db.runOp(1, { key: op.key, hash: 'h2' }, reserve)).toThrow(
      'operation id reused'
    );
  });

  it('remembers an operation beyond the two-sided signature window', () => {
    const db = setup();
    db.runOp(0, op, reserve);
    // A request signed 60 s in the future stays replayable for 120 s.
    expect(
      db.runOp(GUARD_OPERATION_RETENTION_MS - 1, op, reserve)[0]
    ).toMatchObject({ ok: true, remaining: 1 });
    expect(GUARD_OPERATION_RETENTION_MS).toBeGreaterThan(
      2 * GUARD_SIGNATURE_MAX_SKEW_MS
    );
  });

  it('records nothing for read-only steps', () => {
    const db = setup();
    const before = db.writes();
    db.runOp(0, op, { op: 'kv.get', k: K('x') });
    // Only the bounded purge statement runs.
    expect(db.writes() - before).toBe(1);
  });
});

describe('cleanup planning', () => {
  it('deletes an empty partition and never re-arms it', () => {
    expect(
      planCleanup({ now: 0, purged: 3, rowCount: 0, maxExpiry: null })
    ).toEqual({ idle: true });
  });

  it('re-arms only at a finite future expiry', () => {
    expect(
      planCleanup({ now: 1000, purged: 1, rowCount: 2, maxExpiry: 50_000 })
    ).toEqual({ idle: false, nextAlarmAt: 51_000 });
    expect(
      planCleanup({ now: 1000, purged: 1, rowCount: 2, maxExpiry: 500 })
    ).toEqual({ idle: false, nextAlarmAt: 2000 });
    expect(
      planCleanup({
        now: 1000,
        purged: ALARM_PURGE_LIMIT,
        rowCount: 5000,
        maxExpiry: 90_000,
      })
    ).toEqual({ idle: false, nextAlarmAt: 2000 });
  });

  it('bounds alarm wakes for a partition without new writes', () => {
    const { engine, run } = setup();
    for (let index = 0; index < 2500; index += 1) {
      run(0, {
        op: 'kv.set',
        k: K(`k${index}`),
        v: '1',
        ttlMs: 1000 + index,
        mode: 'always',
      });
    }
    let now = 10_000;
    let wakes = 0;
    while (wakes < 20) {
      wakes += 1;
      const purged = engine.purgeExpired(now, ALARM_PURGE_LIMIT);
      const plan = planCleanup({
        now,
        purged,
        rowCount: engine.rowCount(),
        maxExpiry: engine.maxExpiry(),
      });
      if (plan.idle) break;
      now = plan.nextAlarmAt;
    }
    expect(wakes).toBe(3);
  });

  it('retries a failed cleanup with capped backoff, then stops', () => {
    expect(planCleanupRetry(0, 1)).toBe(60_000);
    expect(planCleanupRetry(0, 2)).toBe(120_000);
    expect(planCleanupRetry(0, 4)).toBe(480_000);
    expect(planCleanupRetry(0, 5)).toBeNull();
    expect(planCleanupRetry(0, 50)).toBeNull();
  });

  it('recreates its schema after storage is wiped', () => {
    const { engine, run, db } = setup();
    run(0, { op: 'kv.set', k: K('w'), v: 'x', ttlMs: 60_000, mode: 'always' });
    db.exec('DROP TABLE entries');
    db.exec('DROP TABLE meta');
    engine.markStorageCleared();
    expect(run(1, { op: 'kv.get', k: K('w') })[0]).toEqual({
      op: 'kv.get',
      v: null,
    });
    expect(engine.rowCount()).toBe(0);
    engine.setAlarmFailures(1);
    expect(engine.alarmFailures()).toBe(1);
  });

  it('keeps a usable schema after an idle cleanup', () => {
    const { engine, run } = setup();
    run(0, { op: 'kv.set', k: K('c'), v: 'x', ttlMs: 1000, mode: 'always' });
    engine.purgeExpired(5000, 1000);
    expect(engine.rowCount()).toBe(0);
    engine.setAlarmFailures(2);
    expect(engine.alarmFailures()).toBe(2);
    engine.setAlarmFailures(0);
    expect(engine.alarmFailures()).toBe(0);
    expect(run(6000, { op: 'kv.get', k: K('c') })[0]).toEqual({
      op: 'kv.get',
      v: null,
    });
  });

  it('re-arms writes only when they extend expiry past the slack', () => {
    expect(shouldRearm(null, null)).toBe(false);
    expect(shouldRearm(null, 5000)).toBe(true);
    expect(shouldRearm(100_000, 130_000)).toBe(false);
    expect(shouldRearm(100_000, 170_000)).toBe(true);
  });
});

describe('operation counts', () => {
  it('bounds row writes per command', () => {
    const { run, writes } = setup();
    const before = writes();
    run(0, {
      op: 'win.hit',
      windows: [minute('sliding', 5, 'a'), minute('fixed', 5, 'b')],
    });
    // One bounded purge statement plus one upsert per window.
    expect(writes() - before).toBe(3);
    const denied = writes();
    run(0, { op: 'kv.get', k: K('a') });
    expect(writes() - denied).toBe(1);
  });
});
