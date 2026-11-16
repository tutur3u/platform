import { DatabaseSync } from 'node:sqlite';
import type { ParsedGuardCommand } from '@tuturuuu/utils/abuse-guard/protocol';
import { describe, expect, it } from 'vite-plus/test';
import {
  createGuardEngine,
  REQUEST_PURGE_LIMIT,
  type SqlRunner,
} from './engine';
import { ictDay, LIVE_DAY_MS, LIVE_ICT_OFFSET_MS } from './live-mint';

const K = (name: string) => name.padEnd(43, '_').slice(0, 43);
const BUDGET = K('budget');
// 2027-01-15 10:00 ICT.
const NOON = Date.UTC(2027, 0, 15, 3);
const MIDNIGHT = (ictDay(NOON) + 1) * LIVE_DAY_MS - LIVE_ICT_OFFSET_MS;

function setup() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      return {
        toArray: () =>
          statement.all(...(bindings as (string | number | null)[])) as never,
      };
    },
  };
  const engine = createGuardEngine(sql);
  const run = (now: number, cmd: ParsedGuardCommand) => {
    db.exec('BEGIN');
    try {
      const [result] = engine.run([cmd], now);
      db.exec('COMMIT');
      return result as Extract<typeof result, { op: 'live.reserve' }>;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  return { engine, run, db };
}

function reserve(
  actor: string,
  overrides: Partial<Extract<ParsedGuardCommand, { op: 'live.reserve' }>> = {}
): ParsedGuardCommand {
  return {
    op: 'live.reserve',
    actor: K(actor),
    budget: BUDGET,
    actorLimit: 10,
    concurrentLimit: 1,
    durationMs: 180_000,
    free: true,
    // USD 50/day at USD 0.0368/min (D310a).
    limit: 50_000_000,
    rate: 36_800,
    ...overrides,
  };
}

describe('live.reserve', () => {
  it('charges the full 180 s lease and returns the ICT day', () => {
    const { run } = setup();
    expect(run(NOON, reserve('a'))).toEqual({
      op: 'live.reserve',
      ok: true,
      at: NOON,
      expiresAt: NOON + 180_000,
      // ceil(180 * 36_800 / 60) micro-USD.
      reserved: 110_400,
      spent: 110_400,
      limit: 50_000_000,
      alert: 0,
      day: ictDay(NOON),
    });
  });

  it('refuses a second concurrent lease until the lease and grace end', () => {
    const { run } = setup();
    expect(run(NOON, reserve('a')).ok).toBe(true);
    expect(run(NOON + 1000, reserve('a'))).toMatchObject({
      ok: false,
      reason: 'concurrency',
      retryAfterS: 209,
    });
    expect(run(NOON + 210_001, reserve('a')).ok).toBe(true);
  });

  it('enforces the rolling 24 h actor window', () => {
    const { run } = setup();
    const cmd = reserve('a', { actorLimit: 2, concurrentLimit: 5 });
    expect(run(NOON, cmd).ok).toBe(true);
    expect(run(NOON + 1, cmd).ok).toBe(true);
    expect(run(NOON + 2, cmd)).toMatchObject({
      ok: false,
      reason: 'actor',
      retryAfterS: 86_400,
    });
    expect(run(NOON + LIVE_DAY_MS + 1, cmd).ok).toBe(true);
  });

  it('serializes many actors against the global budget first-come-first-served', () => {
    const { run } = setup();
    // 3 leases fit (331_200), the 4th (441_600) would exceed 400_000.
    const results = Array.from({ length: 6 }, (_, index) =>
      run(NOON + index, reserve(`actor-${index}`, { limit: 400_000 }))
    );
    expect(results.map((result) => result.ok)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(results[2]).toMatchObject({ spent: 331_200, alert: 1 });
    expect(results[3]).toMatchObject({
      reason: 'budget',
      spent: 331_200,
      alert: 2,
      retryAfterS: Math.ceil((MIDNIGHT - NOON - 3) / 1000),
    });
    // Each threshold alert is claimed once per day.
    expect(results[4]).toMatchObject({ reason: 'budget', alert: 0 });
  });

  it('paid leases skip the FREE budget but keep actor and concurrency caps', () => {
    const { run } = setup();
    const paid = reserve('p', { free: false, durationMs: 300_000, limit: 1 });
    expect(run(NOON, paid)).toMatchObject({
      ok: true,
      reserved: 0,
      spent: 0,
      expiresAt: NOON + 300_000,
    });
    expect(run(NOON + 1, paid)).toMatchObject({
      ok: false,
      reason: 'concurrency',
    });
  });

  it('clips a FREE lease at ICT midnight and resets the budget for the new day', () => {
    const { run } = setup();
    const near = MIDNIGHT - 60_000;
    const tight = { limit: 120_000, concurrentLimit: 5 };
    expect(run(near, reserve('a', tight))).toMatchObject({
      ok: true,
      expiresAt: MIDNIGHT,
      reserved: 36_800,
    });
    expect(run(near + 1, reserve('b', tight))).toMatchObject({ ok: true });
    expect(run(near + 2, reserve('c', tight))).toMatchObject({
      ok: true,
      spent: 110_400,
      alert: 1,
    });
    expect(run(near + 3, reserve('d', tight))).toMatchObject({
      ok: false,
      reason: 'budget',
      retryAfterS: 60,
    });
    const next = run(MIDNIGHT, reserve('d', tight));
    // A fresh day: the budget restarts and its 80% alert can fire again.
    expect(next).toMatchObject({
      ok: true,
      spent: 110_400,
      alert: 1,
      day: ictDay(NOON) + 1,
    });
  });

  it('keeps storage bounded: old actor, lease and budget rows are purged', () => {
    const { run, engine } = setup();
    for (let index = 0; index < 150; index += 1) {
      run(NOON + index, reserve(`burst-${index}`, { limit: 1_000_000_000 }));
    }
    // Two rows per actor plus one budget row.
    expect(engine.rowCount()).toBe(301);
    // Two ICT days later every burst row and the old budget row are expired;
    // each request purges up to REQUEST_PURGE_LIMIT expired rows.
    const later = NOON + 2 * LIVE_DAY_MS + 1;
    const requests = Math.ceil(301 / REQUEST_PURGE_LIMIT) + 1;
    for (let index = 0; index < requests; index += 1) {
      run(later + index, reserve(`late-${index}`, { limit: 1_000_000_000 }));
    }
    // Only the late actors' rows and today's budget row remain.
    expect(engine.rowCount()).toBe(requests * 2 + 1);
  });

  it('never grows an actor list past its limit', () => {
    const { run, db } = setup();
    const cmd = reserve('steady', { actorLimit: 3, concurrentLimit: 3 });
    for (let index = 0; index < 50; index += 1) run(NOON + index * 1000, cmd);
    const rows = db
      .prepare(
        "SELECT v FROM entries WHERE k LIKE 'live:%:%' AND k NOT LIKE 'live:b:%'"
      )
      .all() as { v: string }[];
    expect(rows.map((row) => JSON.parse(row.v).length)).toEqual([3, 3]);
  });

  it('rolls back on a corrupt stored value instead of resetting it', () => {
    const { run, db } = setup();
    run(NOON, reserve('a'));
    db.prepare("UPDATE entries SET v = 'nope' WHERE k LIKE 'live:a:%'").run();
    expect(() => run(NOON + 300_000, reserve('a'))).toThrow();
  });
});
