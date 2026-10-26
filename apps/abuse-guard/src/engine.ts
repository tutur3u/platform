/**
 * Command engine for one guard partition. Synchronous and storage-agnostic:
 * the Durable Object runs it inside `transactionSync` over its SQLite storage,
 * and unit tests run it over `node:sqlite` with a controlled clock.
 */
import {
  GUARD_OPERATION_RETENTION_MS,
  type GuardResult,
  type GuardWindow,
  type ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';

export type SqlValue = string | number | null | ArrayBuffer;
export interface SqlRunner {
  exec(
    query: string,
    ...bindings: SqlValue[]
  ): { toArray(): Record<string, SqlValue>[] };
}

/** Rows purged per request; the alarm purges larger batches. */
export const REQUEST_PURGE_LIMIT = 64;
export const ALARM_PURGE_LIMIT = 1000;

export const SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS entries (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS entries_exp ON entries (exp)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)',
] as const;

/** Consecutive failed cleanups retried before giving up until the next write. */
export const ALARM_FAILURE_LIMIT = 5;
const ALARM_RETRY_BASE_MS = 60_000;
const ALARM_RETRY_MAX_MS = 60 * 60_000;

/**
 * Next retry for a failed cleanup with capped exponential backoff, or null
 * once the attempt cap is reached. Lazy expiry keeps reads correct meanwhile.
 */
export function planCleanupRetry(now: number, failures: number) {
  if (failures >= ALARM_FAILURE_LIMIT) return null;
  return (
    now +
    Math.min(ALARM_RETRY_MAX_MS, ALARM_RETRY_BASE_MS * 2 ** (failures - 1))
  );
}

/** A stored value the command cannot operate on; the step rolls back. */
export class GuardCommandError extends Error {}

/** Identity of one step of one signed operation, for replay dedupe. */
export type GuardOperation = {
  /** `op:<operation id>:<step index>`; never collides with 43-char digests. */
  key: string;
  /** SHA-256 of the step's commands; a reused id with other commands fails. */
  hash: string;
};

const READ_ONLY_OPS = new Set<ParsedGuardCommand['op']>(['kv.get', 'kv.ttl']);

export function isMutatingStep(cmds: ParsedGuardCommand[]) {
  return cmds.some((cmd) => !READ_ONLY_OPS.has(cmd.op));
}

type Row = { v: string; exp: number };
type WindowState = { i: number; c: number; p: number };

export function createGuardEngine(sql: SqlRunner) {
  for (const statement of SCHEMA_STATEMENTS) sql.exec(statement).toArray();

  function read(k: string, now: number): Row | null {
    const [row] = sql
      .exec('SELECT v, exp FROM entries WHERE k = ? AND exp > ?', k, now)
      .toArray();
    return row ? { v: String(row.v), exp: Number(row.exp) } : null;
  }

  function write(k: string, v: string, exp: number) {
    sql
      .exec(
        'INSERT INTO entries (k, v, exp) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, exp = excluded.exp',
        k,
        v,
        exp
      )
      .toArray();
  }

  function remove(k: string) {
    sql.exec('DELETE FROM entries WHERE k = ?', k).toArray();
  }

  function integer(row: Row | null) {
    if (!row) return 0;
    const value = Number(row.v);
    if (!Number.isSafeInteger(value)) {
      throw new GuardCommandError('value is not an integer');
    }
    return value;
  }

  function windowState(row: Row | null): WindowState | null {
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.v) as WindowState;
      return Number.isSafeInteger(parsed.i) && Number.isSafeInteger(parsed.c)
        ? { i: parsed.i, c: parsed.c, p: Number(parsed.p) || 0 }
        : null;
    } catch {
      throw new GuardCommandError('value is not a window');
    }
  }

  function evaluateWindow(window: GuardWindow, now: number) {
    const index = Math.floor(now / window.windowMs);
    const state = windowState(read(window.k, now));
    let current = 0;
    let previous = 0;
    if (state?.i === index) {
      current = state.c;
      previous = state.p;
    } else if (state?.i === index - 1) {
      previous = state.c;
    }
    // Upstash-compatible sliding window: weight the previous bucket by the
    // share of it still inside the window.
    const total =
      window.algo === 'sliding'
        ? Math.floor(
            previous * (1 - (now % window.windowMs) / window.windowMs)
          ) + current
        : current;
    return {
      window,
      index,
      current,
      previous,
      allowed: total < window.limit,
      remaining: Math.max(0, window.limit - total - 1),
      resetAt: (index + 1) * window.windowMs,
    };
  }

  function execute(cmd: ParsedGuardCommand, now: number): GuardResult {
    switch (cmd.op) {
      case 'win.hit': {
        const evaluated = cmd.windows.map((window) =>
          evaluateWindow(window, now)
        );
        const denied = evaluated.filter((entry) => !entry.allowed);
        if (denied.length > 0) {
          return {
            op: 'win.hit',
            ok: false,
            resetAt: Math.max(...denied.map((entry) => entry.resetAt)),
            windows: evaluated.map((entry) => ({
              remaining: entry.allowed ? entry.remaining : 0,
              resetAt: entry.resetAt,
            })),
          };
        }
        for (const entry of evaluated) {
          const sliding = entry.window.algo === 'sliding';
          write(
            entry.window.k,
            JSON.stringify({
              i: entry.index,
              c: entry.current + 1,
              p: sliding ? entry.previous : 0,
            }),
            (entry.index + (sliding ? 2 : 1)) * entry.window.windowMs
          );
        }
        return {
          op: 'win.hit',
          ok: true,
          resetAt: Math.max(...evaluated.map((entry) => entry.resetAt)),
          windows: evaluated.map((entry) => ({
            remaining: entry.remaining,
            resetAt: entry.resetAt,
          })),
        };
      }
      case 'kv.get':
        return { op: 'kv.get', v: read(cmd.k, now)?.v ?? null };
      case 'kv.set': {
        const existing = read(cmd.k, now);
        if (
          (cmd.mode === 'nx' && existing) ||
          (cmd.mode === 'xx' && !existing)
        ) {
          return { op: 'kv.set', set: false };
        }
        const exp = cmd.keepTtl && existing ? existing.exp : now + cmd.ttlMs;
        write(cmd.k, cmd.v, exp);
        return { op: 'kv.set', set: true };
      }
      case 'kv.del': {
        const existing = read(cmd.k, now);
        remove(cmd.k);
        return { op: 'kv.del', n: existing ? 1 : 0 };
      }
      case 'kv.incr': {
        const existing = read(cmd.k, now);
        const n = integer(existing) + cmd.by;
        const exp = existing ? existing.exp : now + cmd.ttlMsOnCreate;
        write(cmd.k, String(n), exp);
        return { op: 'kv.incr', n, ttlMs: exp - now };
      }
      case 'kv.expire': {
        const existing = read(cmd.k, now);
        if (!existing) return { op: 'kv.expire', set: false };
        write(cmd.k, existing.v, now + cmd.ttlMs);
        return { op: 'kv.expire', set: true };
      }
      case 'kv.ttl': {
        const existing = read(cmd.k, now);
        return { op: 'kv.ttl', ttlMs: existing ? existing.exp - now : -2 };
      }
      case 'res.reserve': {
        // Port of RESERVE_PASSWORD_ATTEMPT_SCRIPT: a denial allocates no new
        // keys and extends no window; increments and receipt commit together.
        const rows = cmd.budgets.map((budget) => {
          const row = read(budget.k, now);
          return { budget, row, count: integer(row) };
        });
        let remaining = Number.MAX_SAFE_INTEGER;
        for (const { budget, row, count } of rows) {
          if (count >= budget.limit) {
            return {
              op: 'res.reserve',
              ok: false,
              remaining: 0,
              retryAfterMs: Math.max(1000, (row?.exp ?? now) - now),
            };
          }
          remaining = Math.min(remaining, budget.limit - count - 1);
        }
        let targetExp = now;
        let targetKey = '';
        for (const { budget, row, count } of rows) {
          const exp = row ? row.exp : now + budget.ttlMs;
          write(budget.k, String(count + 1), exp);
          targetExp = exp;
          targetKey = budget.k;
        }
        write(cmd.receipt, targetKey, targetExp);
        return { op: 'res.reserve', ok: true, remaining, retryAfterMs: 0 };
      }
      case 'res.refund': {
        const receipt = read(cmd.receipt, now);
        if (receipt?.v !== cmd.target) return { op: 'res.refund', n: 0 };
        remove(cmd.receipt);
        const target = read(cmd.target, now);
        const count = integer(target);
        if (!target || count <= 0) return { op: 'res.refund', n: 0 };
        write(cmd.target, String(count - 1), target.exp);
        return { op: 'res.refund', n: count - 1 };
      }
    }
  }

  function purgeExpired(now: number, limit: number) {
    return sql
      .exec(
        'DELETE FROM entries WHERE k IN (SELECT k FROM entries WHERE exp <= ? LIMIT ?) RETURNING k',
        now,
        limit
      )
      .toArray().length;
  }

  return {
    /**
     * Runs every command in order; the caller wraps this in one transaction.
     * With an operation, a step already applied within the retention window
     * returns its recorded results without mutating again. The record is
     * written in the same transaction as the mutation, so a concurrent or
     * replayed duplicate can never apply twice.
     */
    run(
      cmds: ParsedGuardCommand[],
      now: number,
      operation?: GuardOperation
    ): GuardResult[] {
      purgeExpired(now, REQUEST_PURGE_LIMIT);
      if (operation) {
        const prior = read(operation.key, now);
        if (prior) {
          const recorded = JSON.parse(prior.v) as {
            h: string;
            r: GuardResult[];
          };
          if (recorded.h !== operation.hash) {
            throw new GuardCommandError('operation id reused');
          }
          return recorded.r;
        }
      }
      const results = cmds.map((cmd) => execute(cmd, now));
      if (operation && isMutatingStep(cmds)) {
        write(
          operation.key,
          JSON.stringify({ h: operation.hash, r: results }),
          now + GUARD_OPERATION_RETENTION_MS
        );
      }
      return results;
    },

    purgeExpired,

    /** Latest expiry of any row, or null when the partition is empty. */
    maxExpiry(): number | null {
      const [row] = sql.exec('SELECT MAX(exp) AS m FROM entries').toArray();
      return row?.m == null ? null : Number(row.m);
    },

    rowCount(): number {
      const [row] = sql.exec('SELECT COUNT(*) AS n FROM entries').toArray();
      return Number(row?.n ?? 0);
    },

    alarmFailures(): number {
      const [row] = sql
        .exec("SELECT v FROM meta WHERE k = 'alarm_failures'")
        .toArray();
      return Number(row?.v ?? 0);
    },

    setAlarmFailures(failures: number) {
      if (failures <= 0) {
        sql.exec("DELETE FROM meta WHERE k = 'alarm_failures'").toArray();
        return;
      }
      sql
        .exec(
          "INSERT INTO meta (k, v) VALUES ('alarm_failures', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
          failures
        )
        .toArray();
    },
  };
}

export type GuardEngine = ReturnType<typeof createGuardEngine>;

/** Alarm slack: writes re-arm only when they extend expiry beyond it. */
export const ALARM_SLACK_MS = 60_000;

/**
 * Decides the next alarm after a cleanup pass. An empty partition clears its
 * alarm and is never re-armed; otherwise the alarm moves to a finite future
 * expiry. Storage is not wiped with deleteAll(): on SQLite-backed objects that
 * also drops the tables a still-warm instance keeps using.
 */
export function planCleanup(input: {
  now: number;
  purged: number;
  rowCount: number;
  maxExpiry: number | null;
}): { idle: true } | { idle: false; nextAlarmAt: number } {
  if (input.rowCount === 0 || input.maxExpiry === null) {
    return { idle: true };
  }
  // A full batch means more expired rows may remain; continue shortly.
  if (input.purged >= ALARM_PURGE_LIMIT) {
    return { idle: false, nextAlarmAt: input.now + 1000 };
  }
  return {
    idle: false,
    nextAlarmAt: Math.max(input.now + 1000, input.maxExpiry + 1000),
  };
}

/** Whether a write's new expiry warrants moving the alarm later. */
export function shouldRearm(current: number | null, maxExpiry: number | null) {
  if (maxExpiry === null) return false;
  return current === null || maxExpiry > current + ALARM_SLACK_MS;
}
