// The type-level half of the guard. `DataClient.execute` only accepts a
// `Scoped<Q>`, and the only ways to get one are `scoped()`, `global()` and
// `insertInto()`. The runtime walk in `guard.ts` is authoritative; the types
// are an early, partial check. What they guarantee for `scoped()`:
//
// - every top-level table source (name or alias) of the builder has a scope
//   with that alias, or is a global read-only table on the read side;
// - a SELECT source, and an UPDATE's FROM source, has a `read` or `list`
//   scope, and an UPDATE target has an `update` scope;
// - a DELETE source has a `delete`, `read` or `list` scope: Kysely's type
//   for DELETE … USING merges the target and the USING tables, so the
//   types cannot require `delete` on the target alone.
//
// What they do not see: the table behind an alias (Kysely keeps only the
// alias, so `scope('tags', …).as('n')` covers `notes as n` at the type
// level), and subqueries in selections, WHERE, RETURNING, CTEs or set
// operations, so `global()` over a global table with an unscoped tenant
// subquery type-checks. The runtime walk checks the table, the action and
// every subquery, and refuses all of these.

import type {
  Compilable,
  DeleteQueryBuilder,
  OperationNodeSource,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'kysely';
import type { TableScope } from './scope-token';

declare const scopedBrand: unique symbol;

export type Scoped<Q> = Q & { readonly [scopedBrand]: true };

/** Returned instead of `Scoped<Q>` when a table source has no scope. */
export type UnscopedSources<T> = { readonly unscopedSources: T };

export type ExecutableQuery = Compilable<unknown> & OperationNodeSource;

type ReadAction = 'read' | 'list';

/** Table sources (names or aliases) of a builder, by role and action. */
export type SourcesOf<Q> =
  Q extends SelectQueryBuilder<any, infer TB, any>
    ? { read: TB & string; write: never; act: never }
    : Q extends UpdateQueryBuilder<any, infer UT, infer TB, any>
      ? { read: Exclude<TB & string, UT>; write: UT & string; act: 'update' }
      : Q extends DeleteQueryBuilder<any, infer TB, any>
        ? { read: never; write: TB & string; act: 'delete' | ReadAction }
        : { read: never; write: string; act: never };

/** Aliases of the scopes in `L` whose action is one of `Acts`. */
type AliasesWith<L, Acts> =
  L extends TableScope<infer A, infer X>
    ? [X] extends [Acts]
      ? A
      : never
    : never;

type Uncovered<Q, L, G extends string> =
  | Exclude<SourcesOf<Q>['read'], AliasesWith<L, ReadAction> | G>
  | Exclude<SourcesOf<Q>['write'], AliasesWith<L, SourcesOf<Q>['act']>>;

export type Covered<Q, L, G extends string> = [Uncovered<Q, L, G>] extends [
  never,
]
  ? Scoped<Q>
  : UnscopedSources<Uncovered<Q, L, G>>;

export type RowOf<Q> = Q extends Compilable<infer O> ? O : never;

export const brand = <Q>(query: Q) => query as Scoped<Q>;
