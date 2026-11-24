import { DatabaseSync } from 'node:sqlite';
import type { SqlRunner, SqlValue, Transaction } from '../sql';

/** A `SqlRunner` and `transactionSync` stand-in over in-memory node:sqlite. */
export function memorySql() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query: string, ...bindings: SqlValue[]) {
      // Durable Object `sql.exec` runs eagerly; so does this stand-in.
      const rows = db.prepare(query).all(...bindings) as Record<
        string,
        SqlValue
      >[];
      return { toArray: () => rows };
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
