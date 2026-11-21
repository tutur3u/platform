import type { SqlRunner } from './store';

/**
 * Durable per-object operation budgets. Counters live in the object's own
 * storage, so a restart or eviction cannot reset them, and every request
 * either takes one unit or is refused before doing any other work. The
 * witness schedules no alarms and makes no outbound calls, so these bounds
 * and the request size cap bound its billable work.
 */
export const LIMITS = {
  /** Per minute, per object. */
  perMinute: { append: 60, attest: 600, challenge: 120, read: 300, admin: 30 },
  /** All operations per UTC day, per object. */
  perDay: 20_000,
} as const;

export type MeteredOp = keyof typeof LIMITS.perMinute;

const MINUTE = 60_000;
const DAY = 86_400_000;

export function createMeter(sql: SqlRunner) {
  return {
    ensure() {
      sql
        .exec(
          'CREATE TABLE IF NOT EXISTS usage (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)'
        )
        .toArray();
    },
    /** Takes one unit of `op` at `now`; false when a budget is exhausted. */
    take(op: MeteredOp, now: number): boolean {
      sql.exec('DELETE FROM usage WHERE until <= ?', now).toArray();
      const minute = Math.floor(now / MINUTE);
      const day = Math.floor(now / DAY);
      const buckets: [string, number, number][] = [
        [`${op}:${minute}`, LIMITS.perMinute[op], (minute + 1) * MINUTE],
        [`day:${day}`, LIMITS.perDay, (day + 1) * DAY],
      ];
      for (const [bucket, limit] of buckets) {
        const row = sql
          .exec('SELECT n FROM usage WHERE bucket = ?', bucket)
          .toArray()[0];
        if (row && Number(row.n) >= limit) return false;
      }
      for (const [bucket, , until] of buckets) {
        sql
          .exec(
            'INSERT INTO usage (bucket, n, until) VALUES (?, 1, ?) ON CONFLICT (bucket) DO UPDATE SET n = n + 1',
            bucket,
            until
          )
          .toArray();
      }
      return true;
    },
  };
}

export type Meter = ReturnType<typeof createMeter>;
