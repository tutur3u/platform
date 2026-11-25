// The compile-time guard. It walks every query node in the tree (FROM, JOIN,
// subqueries, CTEs, set operations, RETURNING) and refuses the statement
// unless each tenant table carries its minted scope as a top-level AND of
// WHERE, or of the ON clause of an INNER or LEFT join of that table. It also
// refuses RIGHT, FULL and APPLY joins, raw SQL fragments, unregistered or
// schema-qualified tables, writes to non-tenant tables, `ws_id` assignments
// in any letter case, unapproved inserts, REPLACE and any upsert whose
// conflict handling could reach another workspace.

import type { Action } from '@tuturuuu/authz';
import type { OperationNode } from 'kysely';
import {
  columnRef,
  conjuncts,
  filterOf,
  isNode,
  isSubquery,
  type Node,
  type Source,
  tableSource,
} from './ast';
import { refuse } from './errors';
import {
  tableSpec,
  type TableRegistry,
  type TableSpecs,
  WS_COLUMN,
} from './registry';
import type { ScopeInfo, ScopeMint } from './scope-token';

export type InsertApproval = Readonly<{
  table: string;
  wsId: string;
  columns: unknown;
}>;

export type GuardContext = Readonly<{
  tables: TableRegistry<unknown, TableSpecs<unknown>>;
  mint: ScopeMint;
  inserts: WeakMap<OperationNode, InsertApproval>;
}>;

const QUERY_KINDS = new Set([
  'SelectQueryNode',
  'InsertQueryNode',
  'UpdateQueryNode',
  'DeleteQueryNode',
]);
const READ_ACTIONS: ReadonlySet<Action> = new Set(['read', 'list']);

// A join's ON clause scopes the joined table only when every output row from
// that table passed the ON clause. RIGHT and FULL joins (and APPLY forms)
// also return unmatched rows of the joined table, so they are refused.
const ON_SCOPED_JOINS: ReadonlySet<string> = new Set([
  'InnerJoin',
  'LeftJoin',
  'LateralInnerJoin',
  'LateralLeftJoin',
]);
const ALLOWED_JOINS: ReadonlySet<string> = new Set([
  ...ON_SCOPED_JOINS,
  'CrossJoin',
  'LateralCrossJoin',
]);

type Role = 'read' | 'update' | 'delete' | 'insert';

class Walker {
  readonly wsIds = new Set<string>();

  constructor(private readonly ctx: GuardContext) {}

  findScope(
    filters: unknown[],
    source: Source,
    accept: (action: Action) => boolean
  ) {
    for (const filter of filters) {
      for (const node of conjuncts(filter)) {
        const info: ScopeInfo | undefined = this.ctx.mint.lookup(node);
        if (
          info &&
          info.alias === source.alias &&
          info.table === source.table &&
          accept(info.action)
        ) {
          return info;
        }
      }
    }
    return undefined;
  }

  checkSource(
    raw: unknown,
    role: Role,
    filters: unknown[],
    ctes: ReadonlySet<string>
  ) {
    if (isSubquery(raw)) return; // walked as its own query node
    const source = tableSource(raw);
    if (!source) return refuse('Unsupported table source.');
    if (source.schema) return refuse(`Schema-qualified table: ${source.table}`);
    if (role === 'read' && ctes.has(source.table)) return;
    const spec = tableSpec(this.ctx.tables, source.table);
    if (!spec) return refuse(`Unregistered table: ${source.table}`);
    if (spec.kind === 'system') return refuse(`System table: ${source.table}`);
    if (spec.kind === 'global-readonly') {
      if (role !== 'read') refuse(`Read-only table: ${source.table}`);
      return;
    }
    if (role === 'insert') return; // checked by checkInsert
    const accept =
      role === 'read'
        ? (a: Action) => READ_ACTIONS.has(a)
        : (a: Action) => a === role;
    const info = this.findScope(filters, source, accept);
    if (!info) return refuse(`Unscoped tenant table: ${source.alias}`);
    this.wsIds.add(info.wsId);
  }

  checkAssignments(updates: unknown) {
    for (const update of (updates as unknown[] | undefined) ?? []) {
      const ref = isNode(update) ? columnRef(update.column) : undefined;
      if (!ref) refuse('Unsupported column assignment.');
      if (ref?.column === WS_COLUMN) refuse('ws_id may not be assigned.');
    }
  }

  checkInsert(node: Node) {
    if (node.replace === true || node.orAction !== undefined) {
      refuse(
        'INSERT OR REPLACE / REPLACE and other conflict actions are refused.'
      );
    }
    if (node.onDuplicateKey !== undefined)
      refuse('ON DUPLICATE KEY is refused.');
    const source = tableSource(node.into);
    if (!source || source.schema) return refuse('Unsupported insert target.');
    const spec = tableSpec(this.ctx.tables, source.table);
    if (!spec) return refuse(`Unregistered table: ${source.table}`);
    if (spec.kind !== 'tenant')
      return refuse(`Insert into ${spec.kind} table: ${source.table}`);
    const approval = isNode(node.values)
      ? this.ctx.inserts.get(node.values)
      : undefined;
    if (
      !approval ||
      approval.table !== source.table ||
      approval.columns !== node.columns
    ) {
      return refuse('Tenant inserts must be built by DataClient.insertInto.');
    }
    this.wsIds.add(approval.wsId);
    if (node.onConflict !== undefined)
      this.checkUpsert(node.onConflict as Node, source);
  }

  checkUpsert(conflict: Node, target: Source) {
    if (
      conflict.constraint !== undefined ||
      conflict.indexExpression !== undefined
    ) {
      refuse('Upserts must name their conflict columns.');
    }
    const columns = ((conflict.columns as unknown[] | undefined) ?? []).map(
      (column) => columnRef(column)?.column
    );
    const targetHasWs = columns.includes(WS_COLUMN);
    const updateWhere = isNode(conflict.updateWhere)
      ? conflict.updateWhere.where
      : undefined;
    if (conflict.doNothing === true) {
      if (!targetHasWs) refuse('ON CONFLICT DO NOTHING must target ws_id.');
      return;
    }
    this.checkAssignments(conflict.updates);
    const pinned = conjuncts(updateWhere).some((node) =>
      this.isExcludedWsMatch(node, target)
    );
    if (!targetHasWs && !pinned) {
      refuse(
        'Upserts must target ws_id or require target.ws_id = excluded.ws_id.'
      );
    }
    const info = this.findScope(
      [updateWhere],
      { ...target, alias: target.table },
      (a) => a === 'update'
    );
    if (!info) refuse('ON CONFLICT DO UPDATE must carry the update scope.');
    else this.wsIds.add(info.wsId);
  }

  isExcludedWsMatch(node: Node, target: Source): boolean {
    if (node.kind !== 'BinaryOperationNode') return false;
    const operator = node.operator as Node;
    if (operator.kind !== 'OperatorNode' || operator.operator !== '=')
      return false;
    const sides = [columnRef(node.leftOperand), columnRef(node.rightOperand)];
    if (sides.some((side) => side?.column !== WS_COLUMN)) return false;
    const tables = sides.map((side) => side?.table ?? target.table).sort();
    return tables[0] === 'excluded' && tables[1] === target.table;
  }

  checkQuery(node: Node, outer: ReadonlySet<string>) {
    const ctes = new Set(outer);
    const withNode = node.with as Node | undefined;
    for (const cte of (withNode?.expressions as Node[] | undefined) ?? []) {
      const name = tableSource((cte.name as Node).table)?.table;
      if (!name) refuse('Unsupported CTE name.');
      else if (tableSpec(this.ctx.tables, name))
        refuse(`CTE shadows a table: ${name}`);
      else ctes.add(name);
    }
    const where = filterOf(node, 'where');
    const joins = (node.joins as Node[] | undefined) ?? [];
    const joinSources = () => {
      for (const join of joins) {
        const type = String(join.joinType);
        if (!ALLOWED_JOINS.has(type)) {
          refuse(`Join type ${type} is refused.`);
        }
        const filters = ON_SCOPED_JOINS.has(type)
          ? [where, filterOf(join, 'on')]
          : [where];
        this.checkSource(join.table, 'read', filters, ctes);
      }
    };
    const froms = (from: unknown) =>
      ((from as Node | undefined)?.froms as unknown[] | undefined) ?? [];

    switch (node.kind) {
      case 'SelectQueryNode':
        for (const from of froms(node.from))
          this.checkSource(from, 'read', [where], ctes);
        joinSources();
        break;
      case 'UpdateQueryNode':
        this.checkSource(node.table, 'update', [where], ctes);
        for (const from of froms(node.from))
          this.checkSource(from, 'read', [where], ctes);
        joinSources();
        this.checkAssignments(node.updates);
        break;
      case 'DeleteQueryNode': {
        const targets = froms(node.from);
        if (targets.length !== 1) refuse('Delete exactly one table.');
        for (const from of targets)
          this.checkSource(from, 'delete', [where], ctes);
        const using =
          ((node.using as Node | undefined)?.tables as unknown[] | undefined) ??
          [];
        for (const table of using)
          this.checkSource(table, 'read', [where], ctes);
        joinSources();
        break;
      }
      case 'InsertQueryNode':
        this.checkInsert(node);
        break;
    }
    return ctes;
  }

  walk(value: unknown, ctes: ReadonlySet<string>): void {
    if (Array.isArray(value)) {
      for (const item of value) this.walk(item, ctes);
      return;
    }
    if (!isNode(value)) return;
    if (value.kind === 'RawNode')
      refuse('Raw SQL is only allowed through the statement registry.');
    if (value.kind === 'MergeQueryNode') refuse('MERGE is refused.');
    const scope = QUERY_KINDS.has(value.kind)
      ? this.checkQuery(value, ctes)
      : ctes;
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'kind') this.walk(child, scope);
    }
  }
}

/** Throws `DataError('refused')` unless every tenant table in the tree is scoped. */
export function assertScoped(root: OperationNode, ctx: GuardContext): void {
  if (!QUERY_KINDS.has(root.kind))
    refuse(`Unsupported statement: ${root.kind}`);
  const walker = new Walker(ctx);
  walker.walk(root, new Set());
  if (walker.wsIds.size > 1)
    refuse('A statement may touch one workspace only.');
}
