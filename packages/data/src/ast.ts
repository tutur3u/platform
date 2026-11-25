// Read-only helpers over Kysely's frozen operation nodes. SQLite compares
// identifiers case-insensitively, even when quoted, so every table, alias
// and column name is lowercased before it is compared.

import type { OperationNode } from 'kysely';

/** Loosely typed view of a Kysely operation node. */
export type Node = OperationNode & Record<string, unknown>;

export const isNode = (value: unknown): value is Node =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Node).kind === 'string';

/** The lowercased name of an identifier node. */
export const nameOf = (node: unknown): string | undefined =>
  isNode(node) && node.kind === 'IdentifierNode'
    ? (node.name as string).toLowerCase()
    : undefined;

/** Every top-level AND conjunct of a filter, including the AND nodes. */
export function conjuncts(filter: unknown, out: Node[] = []): Node[] {
  if (!isNode(filter)) return out;
  out.push(filter);
  if (filter.kind === 'AndNode') {
    conjuncts(filter.left, out);
    conjuncts(filter.right, out);
  } else if (filter.kind === 'ParensNode') {
    conjuncts(filter.node, out);
  }
  return out;
}

/** The filter of a `WhereNode` or `OnNode` property. */
export const filterOf = (holder: unknown, key: 'where' | 'on'): unknown =>
  isNode(holder) ? (holder[key] as Node | undefined)?.[key] : undefined;

/** The column a reference or column node names, with its table qualifier. */
export function columnRef(
  node: unknown
): { table?: string; column: string } | undefined {
  if (!isNode(node)) return undefined;
  if (node.kind === 'ColumnNode') {
    const column = nameOf(node.column);
    return column ? { column } : undefined;
  }
  if (node.kind === 'ReferenceNode') {
    const inner = columnRef(node.column);
    if (!inner) return undefined;
    const table = isNode(node.table)
      ? nameOf((node.table.table as Node | undefined)?.identifier)
      : undefined;
    return { table, column: inner.column };
  }
  return undefined;
}

export type Source = { table: string; alias: string; schema: boolean };

/** A plain or aliased table reference; undefined for anything else. */
export function tableSource(node: unknown): Source | undefined {
  if (!isNode(node)) return undefined;
  if (node.kind === 'TableNode') {
    const id = node.table as Node;
    const table = nameOf(id.identifier);
    if (!table) return undefined;
    return { table, alias: table, schema: id.schema !== undefined };
  }
  if (
    node.kind === 'AliasNode' &&
    isNode(node.node) &&
    node.node.kind === 'TableNode'
  ) {
    const inner = tableSource(node.node);
    const alias = nameOf(node.alias);
    if (!inner || !alias) return undefined;
    return { ...inner, alias };
  }
  return undefined;
}

export const isSubquery = (node: unknown): boolean =>
  isNode(node) &&
  (node.kind === 'SelectQueryNode' ||
    (node.kind === 'AliasNode' &&
      isNode(node.node) &&
      node.node.kind === 'SelectQueryNode'));
