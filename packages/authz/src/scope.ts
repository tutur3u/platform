// Scope predicates are opaque outside this entry point. `@tuturuuu/data` is
// the only consumer of `readScopePredicate`; it compiles the tree to SQL.
// The tree lives in a module-private WeakMap, so holders of a predicate
// cannot read or change it through the object itself.

export type PredicateNode =
  | { op: 'true' }
  | { op: 'false' }
  | { op: 'eq'; column: string; value: string }
  | { op: 'and' | 'or'; items: readonly PredicateNode[] };

declare const brand: unique symbol;
export type ScopePredicate = { readonly [brand]: 'ScopePredicate' };

const trees = new WeakMap<object, PredicateNode>();

function freezeDeep(node: PredicateNode): PredicateNode {
  if (node.op === 'and' || node.op === 'or') {
    return Object.freeze({
      op: node.op,
      items: Object.freeze(node.items.map(freezeDeep)),
    });
  }
  return Object.freeze({ ...node });
}

export function makeScopePredicate(node: PredicateNode): ScopePredicate {
  const handle = Object.freeze({});
  trees.set(handle, freezeDeep(node));
  return handle as ScopePredicate;
}

export function readScopePredicate(predicate: ScopePredicate): PredicateNode {
  const node = trees.get(predicate as object);
  if (!node) throw new Error('Not a scope predicate.');
  return node;
}

export const DENY_ALL = makeScopePredicate({ op: 'false' });
