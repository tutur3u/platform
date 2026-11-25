// A database definition: the injected Kysely dialect (a D1 dialect in a
// Worker, a fake in tests), the table registry and the statement registry.
// Builders use a driver that refuses to execute, so the only way to run a
// query is through a scoped client.

import {
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  Kysely,
  type QueryCompiler,
  type QueryResult,
} from 'kysely';
import { DataError } from './errors';
import { assertScoped, type GuardContext } from './guard';
import type { TableRegistry, TableSpecs } from './registry';
import {
  admitStatements,
  EMPTY_STORE,
  type StatementRegistry,
  type StatementStore,
} from './statements';

/** Runs compiled statements atomically, e.g. through `D1Database.batch()`. */
export type BatchExecutor = (
  queries: readonly CompiledQuery[]
) => Promise<QueryResult<unknown>[]>;

export type DatabaseConfig<DB, S extends TableSpecs<DB>> = Readonly<{
  dialect: Dialect;
  tables: TableRegistry<DB, S>;
  statements?: StatementRegistry;
  batch?: BatchExecutor;
}>;

declare const dbBrand: unique symbol;

/** An opaque database handle; its executor never leaves this package. */
export type DataDatabase<DB, S extends TableSpecs<DB>> = Readonly<{
  tables: TableRegistry<DB, S>;
  statements?: StatementRegistry;
  readonly [dbBrand]?: DB;
}>;

type Internals = Readonly<{
  dialect: Dialect;
  /** Executes already-guarded compiled queries. */
  runner: Kysely<unknown>;
  batch?: BatchExecutor;
  /** Frozen copies of the registered raw statements, by name. */
  statements: StatementStore;
}>;

const internals = new WeakMap<object, Internals>();

export function internalsOf(
  database: DataDatabase<unknown, TableSpecs<unknown>>
): Internals {
  const found = internals.get(database);
  if (!found)
    throw new DataError('refused', 'Not a database from defineDatabase.');
  return found;
}

class RefusingDriver implements Driver {
  async init() {}
  async acquireConnection(): Promise<DatabaseConnection> {
    throw new DataError('refused', 'Run queries through DataClient.execute.');
  }
  async beginTransaction() {}
  async commitTransaction() {}
  async rollbackTransaction() {}
  async releaseConnection() {}
  async destroy() {}
}

export function defineDatabase<DB, S extends TableSpecs<DB>>(
  config: DatabaseConfig<DB, S>
): DataDatabase<DB, S> {
  const statements = config.statements
    ? admitStatements(
        config.statements,
        config.tables as TableRegistry<unknown, TableSpecs<unknown>>
      )
    : EMPTY_STORE;
  const database: DataDatabase<DB, S> = Object.freeze({
    tables: config.tables,
    statements: config.statements,
  });
  internals.set(database, {
    dialect: config.dialect,
    runner: new Kysely<unknown>({ dialect: config.dialect }),
    batch: config.batch,
    statements,
  });
  return database;
}

/**
 * The compile hook. It wraps the dialect's compiler, which Kysely calls only
 * for a root statement (`compile()`, `execute()`), so a subquery is checked
 * with its enclosing statement rather than on its own.
 */
export function guardedCompiler(
  dialect: Dialect,
  ctx: GuardContext
): QueryCompiler {
  const compiler = dialect.createQueryCompiler();
  return {
    compileQuery(node, queryId) {
      assertScoped(node, ctx);
      return compiler.compileQuery(node, queryId);
    },
  };
}

/** A per-client builder: guarded compiler, and a driver that never executes. */
export function createBuilder<DB>(
  dialect: Dialect,
  ctx: GuardContext
): Kysely<DB> {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => dialect.createAdapter(),
      createDriver: () => new RefusingDriver(),
      createIntrospector: (db) => dialect.createIntrospector(db),
      createQueryCompiler: () => guardedCompiler(dialect, ctx),
    },
  });
}
