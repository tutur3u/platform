/**
 * `SessionBudget` over SQLite (G17). Isolates flush per-category operation
 * counts; the store sums them per UTC day. When a category's total crosses
 * its daily budget the store marks one park for `SessionControl`, and the
 * UTC rollover marks one clear. Each mark is durable until the object
 * confirms delivery, so a failed `SessionControl` call is retried, never
 * duplicated within a day and never lost on restart.
 *
 * Budgets only park background work. They never stop issuance, which stays
 * an operator decision, so a flood cannot stop sign-in for everyone.
 */
import type { AccountingCategory } from '@tuturuuu/session/control';
import { ACCOUNTING_CATEGORIES, isAccountingCategory } from './fence-store';
import { firstRow, type SqlRunner } from './sql';

/** Largest count one isolate flush may add per category. */
export const MAX_FLUSH_COUNT = 10_000_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyBudgets = Readonly<Record<AccountingCategory, number>>;

/**
 * Placeholder daily operation budgets per environment. The release
 * authority sets real values through `TTR_SESSION_DAILY_BUDGETS` before
 * staging acceptance.
 */
export const DEFAULT_DAILY_BUDGETS: DailyBudgets = Object.freeze({
  control: 500_000,
  abuse: 500_000,
  epoch: 1_000_000,
  index: 500_000,
  session: 5_000_000,
  credential: 1_000_000,
  keys: 200_000,
});

export class BudgetInputError extends Error {}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcMidnight(nowMs: number): number {
  return (Math.floor(nowMs / DAY_MS) + 1) * DAY_MS;
}

/**
 * `TTR_SESSION_DAILY_BUDGETS`: empty uses the defaults; otherwise JSON text
 * naming some categories with positive safe-integer budgets. A malformed
 * value returns null so the host can alert and fall back to the defaults.
 */
export function parseDailyBudgets(raw: unknown): DailyBudgets | null {
  if (raw === undefined || raw === null) return DEFAULT_DAILY_BUDGETS;
  if (typeof raw !== 'string') return null;
  if (raw.trim() === '') return DEFAULT_DAILY_BUDGETS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const budgets: Record<string, number> = { ...DEFAULT_DAILY_BUDGETS };
  for (const key of Object.keys(parsed)) {
    const descriptor = Object.getOwnPropertyDescriptor(parsed, key);
    const value = descriptor && 'value' in descriptor ? descriptor.value : null;
    if (
      !isAccountingCategory(key) ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      return null;
    }
    budgets[key] = value;
  }
  return Object.freeze(budgets) as DailyBudgets;
}

/** Validates one isolate flush: own keys, known categories, bounded counts. */
export function parseFlushCounts(
  value: unknown
): Partial<Record<AccountingCategory, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BudgetInputError('counts must be an object');
  }
  const counts: Partial<Record<AccountingCategory, number>> = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const count = descriptor && 'value' in descriptor ? descriptor.value : null;
    if (!isAccountingCategory(key)) {
      throw new BudgetInputError('unknown accounting category');
    }
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > MAX_FLUSH_COUNT
    ) {
      throw new BudgetInputError('count out of range');
    }
    counts[key] = count;
  }
  return counts;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS budget_day (
    category TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    total INTEGER NOT NULL,
    parked INTEGER NOT NULL,
    park_sent INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS budget_meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  )`,
];

export type BudgetStore = ReturnType<typeof createBudgetStore>;

export function createBudgetStore(sql: SqlRunner) {
  // Created eagerly when the object is constructed, outside any storage
  // transaction, so a rolled-back write can never drop the tables while the
  // store believes they exist. `CREATE TABLE IF NOT EXISTS` is idempotent.
  const ensureSchema = () => {
    for (const statement of SCHEMA) sql.exec(statement).toArray();
  };
  ensureSchema();

  const getMeta = (key: string) => {
    const row = firstRow(sql, 'SELECT v FROM budget_meta WHERE k = ?', key);
    return row ? String(row.v) : null;
  };
  const setMeta = (key: string, value: string | null) => {
    if (value === null) {
      sql.exec('DELETE FROM budget_meta WHERE k = ?', key).toArray();
      return;
    }
    sql
      .exec(
        'INSERT INTO budget_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
        key,
        value
      )
      .toArray();
  };

  /**
   * Moves every row from an earlier UTC day to today's zero. If any of them
   * was parked, marks one pending clear for `SessionControl`.
   */
  const rollover = (nowMs: number) => {
    const day = utcDay(nowMs);
    const stale = sql
      .exec('SELECT category, parked FROM budget_day WHERE day <> ?', day)
      .toArray();
    if (stale.some((row) => Number(row.parked) === 1)) {
      setMeta('clear_pending', day);
    }
    if (stale.length > 0) {
      // Each UTC day's clear gets its own retry allowance.
      setMeta('clear_failures', null);
      sql
        .exec(
          'UPDATE budget_day SET day = ?, total = 0, parked = 0, park_sent = 0 WHERE day <> ?',
          day,
          day
        )
        .toArray();
    }
  };

  const pendingParks = (): AccountingCategory[] => {
    const rows = sql
      .exec(
        'SELECT category FROM budget_day WHERE parked = 1 AND park_sent = 0'
      )
      .toArray();
    return ACCOUNTING_CATEGORIES.filter((category) =>
      rows.some((row) => row.category === category)
    );
  };

  return {
    ensureSchema,
    rollover,

    /**
     * Adds one isolate flush to today's totals. Returns the categories whose
     * park is marked but not yet confirmed delivered.
     */
    flush(
      rawCounts: unknown,
      nowMs: number,
      budgets: DailyBudgets
    ): AccountingCategory[] {
      const counts = parseFlushCounts(rawCounts);
      rollover(nowMs);
      const day = utcDay(nowMs);
      for (const category of ACCOUNTING_CATEGORIES) {
        const count = counts[category];
        if (count === undefined || count === 0) continue;
        const row = firstRow(
          sql,
          'SELECT total, parked FROM budget_day WHERE category = ?',
          category
        );
        const total = Math.min(
          Number.MAX_SAFE_INTEGER,
          Number(row?.total ?? 0) + count
        );
        const parked =
          Number(row?.parked ?? 0) === 1 || total >= budgets[category] ? 1 : 0;
        sql
          .exec(
            `INSERT INTO budget_day (category, day, total, parked, park_sent)
             VALUES (?, ?, ?, ?, 0)
             ON CONFLICT(category) DO UPDATE SET total = excluded.total, parked = excluded.parked, day = excluded.day`,
            category,
            day,
            total,
            parked
          )
          .toArray();
      }
      return pendingParks();
    },

    pendingParks,

    markParkSent(category: AccountingCategory, nowMs: number) {
      sql
        .exec(
          'UPDATE budget_day SET park_sent = 1 WHERE category = ? AND day = ? AND parked = 1',
          category,
          utcDay(nowMs)
        )
        .toArray();
    },

    clearPending(): boolean {
      return getMeta('clear_pending') !== null;
    },

    markClearSent() {
      setMeta('clear_pending', null);
      setMeta('clear_failures', null);
    },

    /** Counts consecutive failed clears; the host stops retrying at a cap. */
    recordClearFailure(): number {
      const failures = Number(getMeta('clear_failures') ?? '0') + 1;
      setMeta('clear_failures', String(failures));
      return failures;
    },

    totals() {
      return sql
        .exec('SELECT category, day, total, parked, park_sent FROM budget_day')
        .toArray();
    },
  };
}
