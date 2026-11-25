// The table registry. Every table a domain touches is declared once as
// `tenant` (rows keyed by `ws_id`), `global-readonly` or `system`. A table
// missing from the registry does not type-check and is refused at runtime.

export type TableKind = 'tenant' | 'global-readonly' | 'system';

export type TableSpec = Readonly<{
  kind: TableKind;
  /** Authorization resource type; defaults to the table name. */
  resource?: string;
}>;

export type TableSpecs<DB> = { readonly [K in keyof DB & string]: TableSpec };

declare const dbBrand: unique symbol;

export type TableRegistry<DB, S extends TableSpecs<DB>> = Readonly<{
  specs: S;
  readonly [dbBrand]?: DB;
}>;

export type TenantTables<S> = {
  [K in keyof S & string]: S[K] extends { kind: 'tenant' } ? K : never;
}[keyof S & string];

export type GlobalTables<S> = {
  [K in keyof S & string]: S[K] extends { kind: 'global-readonly' } ? K : never;
}[keyof S & string];

/** Rejects declared tables that are not in the database type. */
type NoExtraKeys<S, K extends string> = {
  readonly [X in Exclude<keyof S, K>]: never;
};

/** The column every tenant table is keyed by. */
export const WS_COLUMN = 'ws_id';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

const KINDS: ReadonlySet<string> = new Set([
  'tenant',
  'global-readonly',
  'system',
]);

/**
 * Declares the tables of one database. Curried so the database type is
 * explicit and the specs are inferred: `defineTables<DB>()({ ... })`.
 */
export function defineTables<DB>() {
  return <const S extends TableSpecs<DB>>(
    specs: S & NoExtraKeys<S, keyof DB & string>
  ): TableRegistry<DB, S> => {
    const copy: Record<string, TableSpec> = {};
    for (const [name, spec] of Object.entries(
      specs as Record<string, TableSpec>
    )) {
      if (!isIdentifier(name)) throw new Error(`Invalid table name: ${name}`);
      if (!KINDS.has(spec.kind)) {
        throw new Error(`Invalid table kind for ${name}: ${String(spec.kind)}`);
      }
      copy[name] = Object.freeze({
        kind: spec.kind,
        resource: spec.resource ?? name,
      });
    }
    return Object.freeze({ specs: Object.freeze(copy) as unknown as S });
  };
}

export function tableSpec(
  registry: TableRegistry<unknown, TableSpecs<unknown>>,
  name: string
): TableSpec | undefined {
  const specs = registry.specs as Record<string, TableSpec>;
  return Object.hasOwn(specs, name) ? specs[name] : undefined;
}
