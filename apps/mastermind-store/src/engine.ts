/**
 * Storage engine of the Mastermind store: one SQLite table of expiring
 * key-value rows plus a meta table for the stop fence and the daily write
 * counter. Runs inside one Durable Object, so every call is atomic.
 *
 * Billing bounds: no alarms or self-scheduling; expired rows are removed
 * at most `cleanupPerWrite` at a time during writes; live rows are capped;
 * writes per UTC day are capped durably; a stop fence refuses everything.
 */
import {
  MASTERMIND_STORE_LIMITS,
  type ParsedStoreOp,
  type StoreErrorCode,
  type StoreResult,
} from '@tuturuuu/utils/mastermind-store/protocol';

/** The subset of `SqlStorage` the engine uses (node:sqlite in unit tests). */
export interface SqlLike {
  exec(
    query: string,
    ...bindings: (string | number | null)[]
  ): { toArray(): Record<string, unknown>[] };
}

export class StoreError extends Error {
  constructor(readonly code: StoreErrorCode) {
    super(code);
  }
}

const WRITE_OPS = new Set(['set', 'cas', 'cad', 'del']);

export function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createEngine(sql: SqlLike) {
  const rows = (query: string, ...b: (string | number | null)[]) =>
    sql.exec(query, ...b).toArray();
  const meta = (key: string) =>
    (rows('SELECT v FROM meta WHERE k = ?', key)[0]?.v as string | undefined) ??
    null;
  const setMeta = (key: string, value: string) =>
    rows(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      value
    );

  function ensureSchema() {
    rows(
      'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)'
    );
    rows('CREATE INDEX IF NOT EXISTS kv_exp ON kv (exp)');
    rows(
      'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
    );
  }

  const current = (key: string, now: number) =>
    (rows('SELECT v FROM kv WHERE k = ? AND exp > ?', key, now)[0]?.v as
      | string
      | undefined) ?? null;

  function put(key: string, value: string, ttlMs: number, now: number) {
    const exists = rows('SELECT 1 AS x FROM kv WHERE k = ?', key).length > 0;
    if (!exists) {
      const count = Number(rows('SELECT count(*) AS n FROM kv')[0]?.n ?? 0);
      if (count >= MASTERMIND_STORE_LIMITS.maxRows)
        throw new StoreError('full');
    }
    rows(
      'INSERT INTO kv (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp',
      key,
      value,
      now + ttlMs
    );
  }

  function cleanup(now: number) {
    rows(
      'DELETE FROM kv WHERE k IN (SELECT k FROM kv WHERE exp <= ? LIMIT ?)',
      now,
      MASTERMIND_STORE_LIMITS.cleanupPerWrite
    );
  }

  /** Charges the daily write budget; throws `budget` when it would overflow. */
  function charge(writes: number, now: number, budget: number) {
    if (writes === 0) return;
    const day = utcDay(now);
    const used = meta('day') === day ? Number(meta('writes') ?? 0) : 0;
    if (used + writes > budget) throw new StoreError('budget');
    setMeta('day', day);
    setMeta('writes', String(used + writes));
  }

  function apply(op: ParsedStoreOp, now: number): StoreResult {
    switch (op.op) {
      case 'get':
        return current(op.k, now);
      case 'mget':
        return op.ks.map((key) => current(key, now));
      case 'set':
        if (op.mode === 'nx' && current(op.k, now) !== null) return false;
        put(op.k, op.v, op.ttlMs, now);
        return true;
      case 'cas':
        if (current(op.k, now) !== op.expect) return false;
        put(op.k, op.v, op.ttlMs, now);
        return true;
      case 'cad':
        if (current(op.k, now) !== op.expect) return false;
        rows('DELETE FROM kv WHERE k = ?', op.k);
        return true;
      case 'del': {
        const had = current(op.k, now) !== null;
        rows('DELETE FROM kv WHERE k = ?', op.k);
        return had;
      }
    }
  }

  return {
    ensureSchema,
    stopped: () => meta('stopped') === '1',
    setStopped(stopped: boolean) {
      setMeta('stopped', stopped ? '1' : '0');
    },
    status(now: number, budget: number) {
      const day = utcDay(now);
      return {
        stopped: meta('stopped') === '1',
        day,
        writes: meta('day') === day ? Number(meta('writes') ?? 0) : 0,
        budget,
        rows: Number(rows('SELECT count(*) AS n FROM kv')[0]?.n ?? 0),
      };
    },
    /** Runs every op or none; the caller wraps this in one transaction. */
    run(ops: ParsedStoreOp[], now: number, budget: number): StoreResult[] {
      if (meta('stopped') === '1') throw new StoreError('stopped');
      const writes = ops.filter((op) => WRITE_OPS.has(op.op)).length;
      charge(writes, now, budget);
      if (writes > 0) cleanup(now);
      return ops.map((op) => apply(op, now));
    },
  };
}

export type StoreEngine = ReturnType<typeof createEngine>;
