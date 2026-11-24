/**
 * The `SessionControl` stop-fence record over SQLite (G8). One row holds
 * `{ mode, version, background, budgetParks, changedAtMs, actor, reason }`;
 * every change bumps `version` by exactly one and appends to a fence log that
 * keeps the last 1,000 events, in the caller's storage transaction.
 *
 * An environment whose fence was never written reads as `stopped` with
 * `background: parked` at version 0, so a newly created object issues
 * nothing until an operator's first `setFence('running')`. Security cleanup
 * still runs under `stopped`; see the mode table in `@tuturuuu/session`.
 */
import {
  type AccountingCategory,
  type BackgroundState,
  type FenceMode,
  type FenceSnapshot,
  isFenceMode,
} from '@tuturuuu/session/control';
import { firstRow, type SqlRunner } from './sql';

export const FENCE_LOG_LIMIT = 1_000;
export const FENCE_REASON_MAX_LENGTH = 500;
export const FENCE_ACTOR_MAX_LENGTH = 200;

export const ACCOUNTING_CATEGORIES = Object.freeze([
  'control',
  'abuse',
  'epoch',
  'index',
  'session',
  'credential',
  'keys',
] as const satisfies readonly AccountingCategory[]);

export function isAccountingCategory(
  value: unknown
): value is AccountingCategory {
  return (
    typeof value === 'string' &&
    (ACCOUNTING_CATEGORIES as readonly string[]).includes(value)
  );
}

export type FenceRecord = Readonly<{
  mode: FenceMode;
  version: number;
  background: BackgroundState;
  budgetParks: readonly AccountingCategory[];
  changedAtMs: number;
  actor: string;
  reason: string;
}>;

export type FenceChange = Readonly<{
  record: FenceRecord;
  changed: boolean;
  /**
   * The change made some parked background work runnable again: the mode
   * became less strict, background resumed, or a budget park cleared.
   */
  widened: boolean;
}>;

export class FenceInputError extends Error {}

const INITIAL: FenceRecord = Object.freeze({
  mode: 'stopped',
  version: 0,
  background: 'parked',
  budgetParks: Object.freeze([]),
  changedAtMs: 0,
  actor: 'initial',
  reason: 'fence never written',
});

const RANK: Readonly<Record<FenceMode, number>> = {
  running: 0,
  issuance_stopped: 1,
  stopped: 2,
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fence (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL,
    version INTEGER NOT NULL,
    background TEXT NOT NULL,
    budget_parks TEXT NOT NULL,
    changed_at_ms INTEGER NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS fence_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL,
    mode TEXT NOT NULL,
    background TEXT NOT NULL,
    budget_parks TEXT NOT NULL,
    at_ms INTEGER NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL
  )`,
];

function boundedText(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') {
    throw new FenceInputError(`${field} must be a string`);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > max) {
    throw new FenceInputError(`${field} must be 1 to ${max} characters`);
  }
  return text;
}

function parseParks(text: string): AccountingCategory[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  // A corrupt row parks every category: fail toward less background spend.
  if (!Array.isArray(parsed) || !parsed.every(isAccountingCategory)) {
    return [...ACCOUNTING_CATEGORIES];
  }
  return ACCOUNTING_CATEGORIES.filter((category) => parsed.includes(category));
}

/**
 * Records read with a corrupt field. An explicit write of the fallback value
 * must still repair the row and log the change rather than no-op.
 */
const CORRUPT = new WeakSet<FenceRecord>();

function readRow(sql: SqlRunner): FenceRecord {
  const row = firstRow(sql, 'SELECT * FROM fence WHERE id = 1');
  if (!row) return INITIAL;
  const version = row.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) {
    throw new Error('fence row has an invalid version');
  }
  // A corrupt mode or background reads as the strictest value.
  const mode = isFenceMode(row.mode) ? row.mode : 'stopped';
  const background: BackgroundState =
    row.background === 'running' ? 'running' : 'parked';
  const parksText = String(row.budget_parks);
  const budgetParks = parseParks(parksText);
  const corrupt =
    !isFenceMode(row.mode) ||
    (row.background !== 'running' && row.background !== 'parked') ||
    JSON.stringify(budgetParks) !== parksText;
  const record: FenceRecord = Object.freeze({
    mode,
    version,
    background,
    budgetParks: Object.freeze(budgetParks),
    changedAtMs: Number(row.changed_at_ms),
    actor: String(row.actor),
    reason: String(row.reason),
  });
  if (corrupt) CORRUPT.add(record);
  return record;
}

export type FenceStore = ReturnType<typeof createFenceStore>;

export function createFenceStore(sql: SqlRunner) {
  // Created eagerly when the object is constructed, outside any storage
  // transaction, so a rolled-back write can never drop the tables while the
  // store believes they exist. `CREATE TABLE IF NOT EXISTS` is idempotent.
  const ensureSchema = () => {
    for (const statement of SCHEMA) sql.exec(statement).toArray();
  };
  ensureSchema();

  const write = (
    before: FenceRecord,
    next: Omit<FenceRecord, 'version'>
  ): FenceChange => {
    const sameParks =
      before.budgetParks.length === next.budgetParks.length &&
      before.budgetParks.every((park) => next.budgetParks.includes(park));
    if (
      !CORRUPT.has(before) &&
      before.mode === next.mode &&
      before.background === next.background &&
      sameParks
    ) {
      return Object.freeze({ record: before, changed: false, widened: false });
    }
    if (before.version >= Number.MAX_SAFE_INTEGER) {
      throw new Error('fence version exhausted');
    }
    const version = before.version + 1;
    const parks = JSON.stringify(next.budgetParks);
    sql
      .exec(
        `INSERT INTO fence (id, mode, version, background, budget_parks, changed_at_ms, actor, reason)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, version = excluded.version,
           background = excluded.background, budget_parks = excluded.budget_parks,
           changed_at_ms = excluded.changed_at_ms, actor = excluded.actor, reason = excluded.reason`,
        next.mode,
        version,
        next.background,
        parks,
        next.changedAtMs,
        next.actor,
        next.reason
      )
      .toArray();
    sql
      .exec(
        `INSERT INTO fence_log (version, mode, background, budget_parks, at_ms, actor, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        version,
        next.mode,
        next.background,
        parks,
        next.changedAtMs,
        next.actor,
        next.reason
      )
      .toArray();
    sql
      .exec(
        'DELETE FROM fence_log WHERE seq <= (SELECT MAX(seq) FROM fence_log) - ?',
        FENCE_LOG_LIMIT
      )
      .toArray();
    const widened =
      RANK[next.mode] < RANK[before.mode] ||
      (before.background === 'parked' && next.background === 'running') ||
      before.budgetParks.some((park) => !next.budgetParks.includes(park));
    return Object.freeze({
      record: Object.freeze({ ...next, version }),
      changed: true,
      widened,
    });
  };

  const read = (): FenceRecord => {
    return readRow(sql);
  };

  return {
    ensureSchema,
    read,

    /** The snapshot an isolate passes into every object call. */
    snapshot(nowMs: number): FenceSnapshot {
      const record = read();
      return Object.freeze({
        mode: record.mode,
        version: record.version,
        readAtMs: nowMs,
        background: record.background,
        budgetParks: record.budgetParks,
      });
    },

    /** `ControlEntry.setFence`. Setting the current mode changes nothing. */
    setFence(input: {
      mode: unknown;
      reason: unknown;
      actor: unknown;
      nowMs: number;
    }): FenceChange {
      if (!isFenceMode(input.mode)) {
        throw new FenceInputError('mode must be a fence mode');
      }
      const reason = boundedText(
        input.reason,
        FENCE_REASON_MAX_LENGTH,
        'reason'
      );
      const actor = boundedText(input.actor, FENCE_ACTOR_MAX_LENGTH, 'actor');
      const before = read();
      return write(before, {
        mode: input.mode,
        background: before.background,
        budgetParks: before.budgetParks,
        changedAtMs: input.nowMs,
        actor,
        reason,
      });
    },

    /** `parkBackground` and `resumeBackground`. */
    setBackground(input: {
      background: BackgroundState;
      reason: unknown;
      actor: unknown;
      nowMs: number;
    }): FenceChange {
      const reason = boundedText(
        input.reason,
        FENCE_REASON_MAX_LENGTH,
        'reason'
      );
      const actor = boundedText(input.actor, FENCE_ACTOR_MAX_LENGTH, 'actor');
      const before = read();
      return write(before, {
        mode: before.mode,
        background: input.background,
        budgetParks: before.budgetParks,
        changedAtMs: input.nowMs,
        actor,
        reason,
      });
    },

    /** `SessionBudget` only: park one exhausted category's background work. */
    addBudgetPark(category: unknown, nowMs: number): FenceChange {
      if (!isAccountingCategory(category)) {
        throw new FenceInputError('unknown accounting category');
      }
      const before = read();
      if (before.budgetParks.includes(category)) {
        return Object.freeze({
          record: before,
          changed: false,
          widened: false,
        });
      }
      return write(before, {
        mode: before.mode,
        background: before.background,
        budgetParks: ACCOUNTING_CATEGORIES.filter(
          (park) => park === category || before.budgetParks.includes(park)
        ),
        changedAtMs: nowMs,
        actor: 'session-budget',
        reason: `daily budget exhausted: ${category}`,
      });
    },

    /** `SessionBudget` only: the midnight UTC reset. */
    clearBudgetParks(nowMs: number): FenceChange {
      const before = read();
      return write(before, {
        mode: before.mode,
        background: before.background,
        budgetParks: [],
        changedAtMs: nowMs,
        actor: 'session-budget',
        reason: 'daily budgets reset',
      });
    },

    /** The newest fence log entries, newest first, at most `limit`. */
    log(limit: number) {
      const bounded = Math.max(1, Math.min(FENCE_LOG_LIMIT, Math.trunc(limit)));
      return sql
        .exec(
          'SELECT version, mode, background, budget_parks, at_ms, actor, reason FROM fence_log ORDER BY seq DESC LIMIT ?',
          bounded
        )
        .toArray();
    },
  };
}
