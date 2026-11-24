/**
 * The slice of Durable Object `SqlStorage` the stores use, so unit tests can
 * run them over `node:sqlite` and the object hands in `ctx.storage.sql`.
 */
export type SqlValue = string | number | null;

export interface SqlRunner {
  exec(
    query: string,
    ...bindings: SqlValue[]
  ): { toArray(): Record<string, SqlValue>[] };
}

export function firstRow(
  sql: SqlRunner,
  query: string,
  ...bindings: SqlValue[]
): Record<string, SqlValue> | undefined {
  return sql.exec(query, ...bindings).toArray()[0];
}

/** `ctx.storage.transactionSync` in the object; a node:sqlite stand-in in tests. */
export type Transaction = <T>(run: () => T) => T;
