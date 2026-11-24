import { DatabaseSync } from 'node:sqlite';
import type { Transaction } from '../control-object';
import type { SqlRunner, SqlValue } from '../sql';

/** A `SqlRunner` and `transactionSync` stand-in over in-memory node:sqlite. */
export function memorySql() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query: string, ...bindings: SqlValue[]) {
      const statement = db.prepare(query);
      return {
        toArray: () => statement.all(...bindings) as Record<string, SqlValue>[],
      };
    },
  };
  let depth = 0;
  const transaction: Transaction = (run) => {
    if (depth > 0) return run();
    depth += 1;
    db.exec('BEGIN');
    try {
      const result = run();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      depth -= 1;
    }
  };
  return { db, sql, transaction };
}

/** A well-formed 32-byte base64url caller key from one repeated byte. */
export function keyOf(byte: number): string {
  return Buffer.from(new Uint8Array(32).fill(byte)).toString('base64url');
}
