// Scope tokens: the only way to put a tenant table into a query. A token is a
// Kysely expression `<alias>.ws_id = ? AND <compiled ScopePredicate>` whose
// operation node is registered with the client that minted it. The guard
// accepts a tenant table only when that exact node is a top-level AND of the
// query (or of the table's join condition), so a hand-written predicate,
// a token from another client or a token inside an OR never counts.

import type { Action } from '@tuturuuu/authz';
import type { PredicateNode } from '@tuturuuu/authz/scope';
import {
  type Expression,
  type ExpressionBuilder,
  expressionBuilder,
  type OperationNode,
  type SqlBool,
} from 'kysely';
import { refuse } from './errors';
import { isIdentifier, WS_COLUMN } from './registry';

declare const scopeBrand: unique symbol;

/** An authorized, workspace-bound predicate for one table alias. */
export interface TableScope<
  A extends string = string,
  Act extends Action = Action,
> extends Expression<SqlBool> {
  readonly table: string;
  readonly alias: A;
  readonly action: Act;
  readonly wsId: string;
  /** The same authorization for the table under another alias. */
  as<N extends string>(alias: N): TableScope<N, Act>;
  readonly [scopeBrand]: A;
}

export type ScopeInfo = Readonly<{
  table: string;
  alias: string;
  action: Action;
  wsId: string;
  tree: PredicateNode;
}>;

type AnyBuilder = ExpressionBuilder<any, any>;

function compilePredicate(
  eb: AnyBuilder,
  alias: string,
  node: PredicateNode
): Expression<SqlBool> {
  switch (node.op) {
    case 'true':
      return eb(eb.lit(1 as number), '=', eb.lit(1 as number));
    case 'false':
      return eb(eb.lit(1 as number), '=', eb.lit(0 as number));
    case 'eq':
      if (!isIdentifier(node.column)) refuse(`Invalid column: ${node.column}`);
      return eb(
        eb.ref(`${alias}.${node.column}` as string),
        '=',
        node.value as never
      );
    case 'and':
    case 'or': {
      if (node.items.length === 0)
        return compilePredicate(eb, alias, { op: 'false' });
      const items = node.items.map((item) => compilePredicate(eb, alias, item));
      return node.op === 'and' ? eb.and(items) : eb.or(items);
    }
    default:
      return refuse('Unknown predicate node.');
  }
}

/** Per-client registry of minted scope nodes. */
export class ScopeMint {
  readonly #nodes = new WeakMap<OperationNode, ScopeInfo>();

  mint<A extends string>(info: ScopeInfo & { alias: A }): TableScope<A> {
    if (!isIdentifier(info.alias)) refuse(`Invalid alias: ${info.alias}`);
    const eb = expressionBuilder() as AnyBuilder;
    const expression = eb.and([
      eb(
        eb.ref(`${info.alias}.${WS_COLUMN}` as string),
        '=',
        info.wsId as never
      ),
      compilePredicate(eb, info.alias, info.tree),
    ]);
    const node = expression.toOperationNode();
    const frozen = Object.freeze({ ...info });
    this.#nodes.set(node, frozen);
    const token = {
      table: info.table,
      alias: info.alias,
      action: info.action,
      wsId: info.wsId,
      expressionType: undefined,
      toOperationNode: () => node,
      as: <N extends string>(alias: N) => this.mint({ ...frozen, alias }),
    };
    return Object.freeze(token) as unknown as TableScope<A>;
  }

  /** The scope a node was minted for, if this client minted it. */
  lookup(node: OperationNode): ScopeInfo | undefined {
    return this.#nodes.get(node);
  }

  /** The scope behind a token, if this client minted it. */
  read(token: TableScope<string>): ScopeInfo | undefined {
    try {
      return this.#nodes.get(token.toOperationNode());
    } catch {
      return undefined;
    }
  }
}
