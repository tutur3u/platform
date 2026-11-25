// A Kysely dialect over Node's built-in `node:sqlite`, for execution-level
// tests against a real SQLite engine. Tests skip when the runtime has no
// `node:sqlite` (Node < 22.5).

import {
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

type SqliteValue = null | number | bigint | string | Uint8Array;
type Statement = {
  all(...params: SqliteValue[]): unknown[];
  run(...params: SqliteValue[]): { changes: number | bigint };
};
export type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

export async function openSqlite(): Promise<SqliteDatabase | undefined> {
  try {
    const { DatabaseSync } = (await import('node:sqlite')) as unknown as {
      DatabaseSync: new (path: string) => SqliteDatabase;
    };
    return new DatabaseSync(':memory:');
  } catch {
    return undefined;
  }
}

export function sqliteDialect(db: SqliteDatabase): Dialect {
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      const rows = db
        .prepare(query.sql)
        .all(...(query.parameters as SqliteValue[]));
      return { rows: rows as R[] };
    },
    streamQuery() {
      throw new Error('Streaming is not supported.');
    },
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  };
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => driver,
    createIntrospector: (kysely) => new SqliteIntrospector(kysely),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  };
}

export const FIXTURE_SCHEMA = `
  create table notes (id text primary key, ws_id text not null, title text, creator_id text);
  create table tags (id text, ws_id text not null, note_id text, name text, primary key (ws_id, id));
  create table countries (code text primary key, name text);
  create table audit_log (id text primary key, body text);
`;
