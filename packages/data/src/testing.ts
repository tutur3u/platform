// A fake SQLite dialect for tests: it compiles with Kysely's SQLite compiler
// and records every executed statement instead of running it. Not for
// production use.

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

export type FakeResponder = (query: CompiledQuery) => QueryResult<unknown>;

export class FakeDatabase {
  readonly executed: CompiledQuery[] = [];
  readonly batches: CompiledQuery[][] = [];
  respond: FakeResponder = () => ({ rows: [] });

  readonly dialect: Dialect = {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new FakeDriver(this),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  };

  readonly batch = async (queries: readonly CompiledQuery[]) => {
    this.batches.push([...queries]);
    return queries.map((query) => this.respond(query));
  };
}

class FakeDriver implements Driver {
  constructor(private readonly fake: FakeDatabase) {}
  async init() {}
  async acquireConnection(): Promise<DatabaseConnection> {
    const fake = this.fake;
    return {
      async executeQuery<R>(query: CompiledQuery) {
        fake.executed.push(query);
        return fake.respond(query) as QueryResult<R>;
      },
      streamQuery() {
        throw new Error('Streaming is not supported by the fake database.');
      },
    };
  }
  async beginTransaction() {}
  async commitTransaction() {}
  async rollbackTransaction() {}
  async releaseConnection() {}
  async destroy() {}
}
