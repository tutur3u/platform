// The raw-SQL registry. Raw statements live in a domain's `sql/` module, each
// with a reviewed predicate comment and a test. They remain a trusted,
// reviewed exception to the builder: `checkSql` narrows the grammar and
// requires `ws_id = ?1` per tenant source, but review of each statement is
// still what vouches for it. `?1` is always bound to the workspace id of the
// scope the statement runs under.
//
// Registration copies and freezes each statement after checking it, and the
// copies live in a module-private store keyed by the registry handle. The
// client executes the stored copy, so changing the caller's object later has
// no effect, and a registry not made by `defineStatements` is refused.

import type { Action } from '@tuturuuu/authz';
import { refuse } from './errors';
import { tableSpec, type TableRegistry, type TableSpecs } from './registry';
import { checkSql } from './sql-check';

export type Statement<I = void> = Readonly<{
  name: string;
  /** The tenant table whose scope the statement runs under. */
  table: string;
  action: Action;
  /** Reviewed note on why the statement only touches rows of workspace ?1. */
  predicate: string;
  /** One SQL statement; `?1` is the workspace id, `?2…` come from `params`. */
  sql: string;
  params: (input: I) => readonly unknown[];
}>;

/** The execution fields of a registered statement; deep-frozen. */
export type StoredStatement = Readonly<{
  name: string;
  table: string;
  action: Action;
  sql: string;
  params: (input: never) => readonly unknown[];
  /** Tenant tables the statement reads or writes, set at admission. */
  tenantTables: readonly string[];
}>;

declare const registryBrand: unique symbol;

export type StatementRegistry = Readonly<{
  names(): readonly string[];
  readonly [registryBrand]: true;
}>;

/** Admission facts, computed at registration and never exposed. */
type Admission = Readonly<{
  sources: readonly Readonly<{ table: string; scoped: boolean }>[];
}>;

type Entry = Readonly<{
  view: Omit<StoredStatement, 'tenantTables'>;
  admission: Admission;
}>;

const registries = new WeakMap<object, ReadonlyMap<string, Entry>>();

function entryOf(statement: Statement<never>): Entry {
  const { name, table, action, predicate, sql, params } = statement;
  if (typeof name !== 'string' || !name)
    throw new Error('Statement name is required.');
  if (typeof predicate !== 'string' || !predicate.trim()) {
    throw new Error(`Statement ${name}: predicate note is required.`);
  }
  if (typeof sql !== 'string' || typeof params !== 'function') {
    throw new Error(`Statement ${name}: sql and params are required.`);
  }
  const parsed = checkSql(name, sql, table, action);
  const sources = parsed.sources.map((source) =>
    Object.freeze({
      table: source.table,
      scoped: parsed.scoped.has(source.alias),
    })
  );
  return Object.freeze({
    view: Object.freeze({ name, table, action, sql, params }),
    admission: Object.freeze({ sources: Object.freeze(sources) }),
  });
}

/** Checks a statement and returns a frozen copy. */
export function defineStatement<I = void>(
  statement: Statement<I>
): Statement<I> {
  entryOf(statement as Statement<never>);
  const { name, table, action, predicate, sql, params } = statement;
  return Object.freeze({ name, table, action, predicate, sql, params });
}

export function defineStatements(
  statements: readonly Statement<never>[]
): StatementRegistry {
  const byName = new Map<string, Entry>();
  for (const statement of statements) {
    const entry = entryOf(statement);
    if (byName.has(entry.view.name))
      throw new Error(`Duplicate statement: ${entry.view.name}`);
    byName.set(entry.view.name, entry);
  }
  const registry = Object.freeze({ names: () => [...byName.keys()] });
  registries.set(registry, byName);
  return registry as unknown as StatementRegistry;
}

/** A read-only view of registered statements. */
export type StatementStore = Readonly<{
  get(name: string): StoredStatement | undefined;
  list(): readonly StoredStatement[];
}>;

function facade(views: ReadonlyMap<string, StoredStatement>): StatementStore {
  return Object.freeze({
    get: (name: string) => views.get(name),
    list: () => Object.freeze([...views.values()]),
  });
}

export const EMPTY_STORE: StatementStore = facade(new Map());

function entriesOf(registry: unknown): ReadonlyMap<string, Entry> {
  const found =
    typeof registry === 'object' && registry !== null
      ? registries.get(registry)
      : undefined;
  if (!found) return refuse('Pass a statement registry from defineStatements.');
  return found;
}

/**
 * The execution fields of a registry's statements, before admission. Only
 * frozen primitives, frozen arrays and the params function are exposed;
 * the source facts admission relies on stay private.
 */
export function statementStore(registry: unknown): StatementStore {
  const views = new Map<string, StoredStatement>();
  for (const [name, entry] of entriesOf(registry)) {
    views.set(
      name,
      Object.freeze({ ...entry.view, tenantTables: Object.freeze([]) })
    );
  }
  return facade(views);
}

/**
 * Admits a registry into a database: every source must be registered and
 * not a system table, the declared table must be a tenant table with
 * `ws_id = ?1` on each of its sources, and no other tenant table may
 * appear. Returns the frozen execution view of the admitted statements.
 */
export function admitStatements(
  registry: unknown,
  tables: TableRegistry<unknown, TableSpecs<unknown>>
): StatementStore {
  const views = new Map<string, StoredStatement>();
  for (const [name, { view, admission }] of entriesOf(registry)) {
    const where = `Statement ${name}`;
    if (tableSpec(tables, view.table)?.kind !== 'tenant') {
      throw new Error(`${where}: ${view.table} is not a tenant table.`);
    }
    const tenantTables = new Set<string>();
    for (const source of admission.sources) {
      const spec = tableSpec(tables, source.table);
      if (!spec)
        throw new Error(`${where}: unregistered table ${source.table}.`);
      if (spec.kind === 'system')
        throw new Error(`${where}: system table ${source.table}.`);
      if (spec.kind !== 'tenant') continue;
      if (source.table !== view.table) {
        throw new Error(
          `${where}: a raw statement may touch one tenant table; ${source.table} is a second.`
        );
      }
      if (!source.scoped) {
        throw new Error(
          `${where}: each ${source.table} source needs ws_id = ?1.`
        );
      }
      tenantTables.add(source.table);
    }
    views.set(
      name,
      Object.freeze({ ...view, tenantTables: Object.freeze([...tenantTables]) })
    );
  }
  return facade(views);
}
