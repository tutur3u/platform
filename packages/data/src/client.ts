// The scoped data client. `forPrincipal(engine, principal, database,
// { budget })` is the only constructor in this slice, and the invocation's
// budget is a required input; there is no exported raw database. Builders come from a Kysely
// instance whose driver refuses to execute, so a query runs only through
// `execute()` / `batch()`, which re-run the guard on the query's own node
// tree and compile it with the injected dialect.

import type { Action, AuthzPrincipal, Engine } from '@tuturuuu/authz';
import { readScopePredicate } from '@tuturuuu/authz/scope';
import {
  type CompiledQuery,
  CompiledQuery as Compiled,
  createQueryId,
  type Insertable,
  type InsertQueryBuilder,
  type InsertResult,
  Kysely,
  type OperationNode,
  type QueryResult,
  type RootOperationNode,
} from 'kysely';
import {
  createBuilder,
  type DataDatabase,
  guardedCompiler,
  internalsOf,
} from './database';
import { DataError, refuse } from './errors';
import type { GuardContext, InsertApproval } from './guard';
import { isInvocationBudget, type QueryBudget } from './budget';
import {
  type GlobalTables,
  tableSpec,
  type TableSpecs,
  type TenantTables,
  WS_COLUMN,
} from './registry';
import {
  brand,
  type Covered,
  type ExecutableQuery,
  type RowOf,
  type Scoped,
} from './scoped';
import { ScopeMint, type TableScope } from './scope-token';
import type { Statement } from './statements';

type FilterableQuery = ExecutableQuery & { where(...args: never[]): unknown };

export type TenantRow<DB, T extends keyof DB> = Omit<
  Insertable<DB[T]>,
  typeof WS_COLUMN
> & {
  ws_id?: string;
};

export interface DataClient<DB, S extends TableSpecs<DB>> {
  /** A query builder whose queries run only through this client. */
  readonly builder: Kysely<DB>;
  readonly budget: QueryBudget;
  /** Authorizes `action` on `table` in `wsId`; throws not_found / forbidden on deny. */
  scope<T extends TenantTables<S>, const Act extends Action>(
    table: T,
    action: Act,
    wsId: string
  ): Promise<TableScope<T, Act>>;
  /** Adds each scope as a top-level AND and brands the query as scoped. */
  scoped<
    Q extends FilterableQuery,
    const L extends readonly [TableScope<string>, ...TableScope<string>[]],
  >(
    query: Q,
    ...scopes: L
  ): Covered<Q, L[number], GlobalTables<S>>;
  /** Brands a query that reads only global read-only tables. */
  global<Q extends ExecutableQuery>(
    query: Q
  ): Covered<Q, never, GlobalTables<S>>;
  /** Authorizes `create` per row, pins ws_id to `wsId` and returns the insert. */
  insertInto<
    T extends TenantTables<S> & keyof DB,
    R extends ExecutableQuery = InsertQueryBuilder<DB, T, InsertResult>,
  >(
    table: T,
    wsId: string,
    rows: readonly TenantRow<DB, T>[],
    build?: (query: InsertQueryBuilder<DB, T, InsertResult>) => R
  ): Promise<Scoped<R>>;
  execute<Q extends ExecutableQuery>(
    query: Scoped<Q>
  ): Promise<QueryResult<RowOf<Q>>>;
  /** Runs several writes as one D1 batch; the budget is charged up front. */
  batch(
    queries: readonly Scoped<ExecutableQuery>[]
  ): Promise<QueryResult<unknown>[]>;
  /** Runs a registered raw statement under a scope whose predicate is unconditional. */
  run<I>(
    statement: Statement<I>,
    scope: TableScope<string>,
    input: I
  ): Promise<QueryResult<unknown>>;
}

export type ClientOptions = Readonly<{
  /**
   * The invocation's query budget from `createInvocationBudget`. Required:
   * the invocation boundary creates one and passes it to every client it
   * builds, so the 1,000-query cap holds across clients.
   */
  budget: QueryBudget;
}>;

export function forPrincipal<DB, S extends TableSpecs<DB>>(
  engine: Engine,
  principal: AuthzPrincipal,
  database: DataDatabase<DB, S>,
  options: ClientOptions
): DataClient<DB, S> {
  const budget = (options as ClientOptions | undefined)?.budget;
  if (!isInvocationBudget(budget)) {
    return refuse('forPrincipal needs a budget from createInvocationBudget.');
  }
  const internal = internalsOf(database as never);
  const mint = new ScopeMint();
  const inserts = new WeakMap<OperationNode, InsertApproval>();
  const ctx: GuardContext = { tables: database.tables, mint, inserts };
  const builder = createBuilder<DB>(internal.dialect, ctx);
  const compiler = guardedCompiler(internal.dialect, ctx);

  const resource = (table: string) => {
    const spec = tableSpec(database.tables, table);
    if (spec?.kind !== 'tenant') return refuse(`Not a tenant table: ${table}`);
    return spec.resource ?? table;
  };

  const compile = (query: ExecutableQuery): CompiledQuery => {
    // The query's own node tree, before any plugin of the instance it was
    // built on, so a builder from elsewhere is held to the same guard.
    const node = query.toOperationNode() as RootOperationNode;
    return compiler.compileQuery(node, createQueryId());
  };

  return {
    builder,
    budget,

    async scope(table, action, wsId) {
      const type = resource(table);
      const result = await engine.scope(principal, action, type, wsId);
      if (!result.allow) throw new DataError(result.as);
      const tree = readScopePredicate(result.predicate);
      return mint.mint({ table, alias: table, action, wsId, tree }) as never;
    },

    scoped(query, ...scopes) {
      let next: unknown = query;
      for (const scope of scopes) {
        if (!mint.read(scope)) refuse('Scope was not minted by this client.');
        next = (
          next as FilterableQuery & { where(scope: unknown): unknown }
        ).where(scope);
      }
      return next as never;
    },

    global(query) {
      return brand(query) as never;
    },

    async insertInto(table, wsId, rows, build) {
      const type = resource(table);
      if (rows.length === 0) refuse('Insert at least one row.');
      // SQLite matches column names in any letter case, so every spelling
      // of ws_id in the payload counts as the workspace column.
      const pinned = rows.map((row) => {
        const copy: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (key.toLowerCase() !== WS_COLUMN) copy[key] = value;
          else if (value !== wsId) throw new DataError('not_found');
        }
        copy[WS_COLUMN] = wsId;
        return copy;
      });
      for (const row of pinned) {
        const decision = await engine.check(principal, 'create', {
          type,
          wsId,
          after: row,
        });
        if (!decision.allow) throw new DataError(decision.as);
      }
      const insert = builder.insertInto(table).values(pinned as never);
      const node = insert.toOperationNode() as OperationNode & {
        values?: OperationNode;
        columns?: unknown;
      };
      if (!node.values) return refuse('Insert has no values.');
      inserts.set(node.values, { table, wsId, columns: node.columns });
      const built = build ? build(insert) : insert;
      return brand(built) as never;
    },

    async execute(query) {
      const compiled = compile(query);
      budget.take(1);
      return internal.runner.executeQuery(compiled) as never;
    },

    async batch(queries) {
      const { batch } = internal;
      if (!batch) return refuse('This database has no batch executor.');
      const compiled = queries.map(compile);
      budget.take(compiled.length);
      return batch(compiled);
    },

    async run(statement, scope, input) {
      // Executes the registered copy; only the name comes from the caller.
      const stored = internal.statements.get(statement.name);
      if (!stored) return refuse(`Unregistered statement: ${statement.name}`);
      // Admission allows one tenant table, the declared one; checked again
      // here because only that table's scope authorizes the statement.
      const [only, ...others] = stored.tenantTables;
      if (only !== stored.table || others.length > 0) {
        refuse(`Statement ${stored.name} touches more than its own table.`);
      }
      const info = mint.read(scope);
      if (!info) return refuse('Scope was not minted by this client.');
      if (info.table !== stored.table || info.action !== stored.action) {
        refuse(
          `Statement ${stored.name} needs a ${stored.action} scope on ${stored.table}.`
        );
      }
      if (info.tree.op !== 'true')
        refuse(`Statement ${stored.name} needs an unconditional scope.`);
      budget.take(1);
      const params = stored.params as (value: unknown) => readonly unknown[];
      const parameters = [info.wsId, ...params(input)];
      return internal.runner.executeQuery(Compiled.raw(stored.sql, parameters));
    },
  };
}
