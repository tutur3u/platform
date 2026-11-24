/**
 * `SignerBudget` over SQLite: a hard daily cap on admitted sign requests.
 * Each authenticated, permitted request reserves one unit before the
 * replay claim, so replays and floods are capped too. Only the current UTC
 * day's row is kept; older rows are deleted on the next reservation, so the
 * table holds at most two rows. There is no alarm.
 */
import { firstRow, type SqlRunner, type Transaction } from './sql';

export const DEFAULT_DAILY_BUDGET = 5_000;
export const MAX_DAILY_BUDGET = 1_000_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type ReserveResult =
  | Readonly<{ ok: true; total: number }>
  | Readonly<{ ok: false; error: 'budget_exhausted'; retryAtMs: number }>;

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcMidnight(nowMs: number): number {
  return (Math.floor(nowMs / DAY_MS) + 1) * DAY_MS;
}

/**
 * `SSO_SIGNER_DAILY_BUDGET`: empty uses the default; otherwise a positive
 * integer up to `MAX_DAILY_BUDGET`. A malformed value returns null so the
 * object can log it and fall back to the default.
 */
export function parseDailyBudget(raw: unknown): number | null {
  if (raw === undefined || raw === null) return DEFAULT_DAILY_BUDGET;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return DEFAULT_DAILY_BUDGET;
  if (!/^[1-9][0-9]{0,6}$/u.test(text)) return null;
  const value = Number(text);
  return value <= MAX_DAILY_BUDGET ? value : null;
}

export function createBudgetStore(sql: SqlRunner, transaction: Transaction) {
  sql.exec(`CREATE TABLE IF NOT EXISTS budget_day (
    day TEXT PRIMARY KEY,
    total INTEGER NOT NULL
  )`);

  return Object.freeze({
    reserve(nowMs: number, limit: number): ReserveResult {
      const day = utcDay(nowMs);
      return transaction(() => {
        sql.exec('DELETE FROM budget_day WHERE day <> ?', day);
        const total = Number(
          firstRow(sql, 'SELECT total FROM budget_day WHERE day = ?', day)
            ?.total ?? 0
        );
        if (total >= limit) {
          return {
            ok: false,
            error: 'budget_exhausted',
            retryAtMs: nextUtcMidnight(nowMs),
          } as const;
        }
        sql.exec(
          `INSERT INTO budget_day (day, total) VALUES (?, 1)
           ON CONFLICT (day) DO UPDATE SET total = total + 1`,
          day
        );
        return { ok: true, total: total + 1 } as const;
      });
    },
  });
}
