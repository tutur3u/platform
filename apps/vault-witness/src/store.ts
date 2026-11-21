/**
 * Storage primitives shared by the witness engines. Engines are synchronous
 * and storage-agnostic: Durable Objects run them inside `transactionSync`
 * over SQLite storage, and unit tests run them over `node:sqlite`.
 */
import {
  type CanonicalValue,
  decodeCanonical,
  encodeCanonical,
} from '@tuturuuu/vault-crypto';

export type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
export interface SqlRunner {
  exec(
    query: string,
    ...bindings: SqlValue[]
  ): { toArray(): Record<string, SqlValue>[] };
}

/**
 * Blobs are bound as an exact-length ArrayBuffer copy, which both SQLite
 * runtimes accept. `slice()` is not enough: on a Node `Buffer` it returns a
 * view whose `.buffer` is a shared pool.
 */
export function blob(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export function asBytes(value: SqlValue | undefined): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new Error('Expected a blob');
}

export function asNumber(value: SqlValue | undefined): number {
  if (typeof value !== 'number') throw new Error('Expected a number');
  return value;
}

export function encode(value: CanonicalValue): ArrayBuffer {
  return blob(encodeCanonical(value));
}

export function decode<T>(value: SqlValue | undefined): T {
  return decodeCanonical(asBytes(value)) as T;
}

/** Typed key-value metadata: integers in `n`, bytes in `b`. */
export function createMeta(sql: SqlRunner) {
  return {
    ensure() {
      sql
        .exec(
          'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, n INTEGER, b BLOB)'
        )
        .toArray();
    },
    num(k: string): number | null {
      const row = sql.exec('SELECT n FROM meta WHERE k = ?', k).toArray()[0];
      return row ? asNumber(row.n) : null;
    },
    bytes(k: string): Uint8Array | null {
      const row = sql.exec('SELECT b FROM meta WHERE k = ?', k).toArray()[0];
      return row ? asBytes(row.b) : null;
    },
    setNum(k: string, n: number) {
      sql
        .exec(
          'INSERT INTO meta (k, n, b) VALUES (?, ?, NULL) ON CONFLICT (k) DO UPDATE SET n = excluded.n',
          k,
          n
        )
        .toArray();
    },
    setBytes(k: string, b: Uint8Array) {
      sql
        .exec(
          'INSERT INTO meta (k, n, b) VALUES (?, NULL, ?) ON CONFLICT (k) DO UPDATE SET b = excluded.b',
          k,
          blob(b)
        )
        .toArray();
    },
  };
}

export type Meta = ReturnType<typeof createMeta>;
