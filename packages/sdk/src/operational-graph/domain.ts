import { validateProjection } from '../cli/operational-domain';
import { fail, type Item } from '../cli/operational-schema';
import { graphCommandSchema } from './contracts';
import {
  canonicalId,
  changedItems,
  duplicatePlan,
  graphMetadata,
  groupIndex,
  groupMembers,
  invalidateGraphVerification,
  pendingDependencies,
  requireItem,
  revokeVerification,
} from './duplicate';

function assertAcyclic(edges: Map<string, Set<string>>, code: string) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id))
      fail(code, 'relationship cycle or collapsed self dependency');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of edges.keys()) visit(id);
}

export function validateOutcomeGraph(
  items: Map<string, Item>,
  groups = groupIndex(items)
) {
  if (items.size > 10_000)
    fail('PROJECTION_CAPACITY', 'graph exceeds the 10,000-item bound');
  validateProjection(items);
  const dependencies = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const item of items.values()) {
    const id = canonicalId(item);
    const root = requireItem(items, id);
    if (root.graph?.disposition.kind === 'duplicate')
      fail(
        'DUPLICATE_CONFLICT',
        'duplicate targets must be direct canonical roots'
      );
    if (item.graph?.disposition.kind === 'duplicate' && id === item.id)
      fail('DUPLICATE_CONFLICT', 'duplicate cannot target itself');
    const edges = dependencies.get(id) ?? new Set<string>();
    for (const dependency of item.dependencies ?? [])
      edges.add(canonicalId(requireItem(items, dependency)));
    dependencies.set(id, edges);
    const parentId = item.graph?.parentId;
    if (parentId) {
      const parent = canonicalId(requireItem(items, parentId));
      const edges = parents.get(id) ?? new Set<string>();
      edges.add(parent);
      parents.set(id, edges);
    }
    for (const related of item.graph?.relatedIds ?? []) {
      if (related === item.id)
        fail('INVALID_RELATION', 'related link cannot target itself');
      if (!requireItem(items, related).graph?.relatedIds?.includes(item.id))
        fail('INVALID_RELATION', 'related links must be symmetric');
    }
    if (
      item.status === 'verified' &&
      pendingDependencies(items, item, groups).length
    )
      fail(
        'INVALID_STATE',
        'verified request has pending canonical dependencies'
      );
    if (item.graph?.disposition.kind === 'closed' && groups.unverified.has(id))
      fail(
        'INVALID_EVIDENCE',
        'closed canonical group has unverified member obligations'
      );
  }
  assertAcyclic(dependencies, 'INVALID_DEPENDENCY');
  assertAcyclic(parents, 'INVALID_PARENT');
}

export function graphReadiness(
  items: Map<string, Item>,
  id: string,
  groups = groupIndex(items)
) {
  validateOutcomeGraph(items, groups);
  const item = requireItem(items, id);
  const members = groupMembers(items, id, groups);
  const pending = [
    ...new Set(
      members.flatMap((member) => pendingDependencies(items, member, groups))
    ),
  ].sort();
  return {
    id,
    canonicalId: canonicalId(item),
    contributingIds: members.map((member) => member.id),
    disposition: item.graph?.disposition ?? { kind: 'open' },
    pendingDependencies: pending,
    ready:
      pending.length === 0 &&
      (!item.graph || item.graph.disposition.kind === 'open'),
    memberVerificationComplete: members.every(
      (member) => member.status === 'verified'
    ),
    liveVerificationPerformed: false,
  };
}

export function graphPlan(
  before: Map<string, Item>,
  input: unknown,
  operationId: string
) {
  const beforeGroups = groupIndex(before);
  validateOutcomeGraph(before, beforeGroups);
  const change = graphCommandSchema.parse(input);
  const items = new Map(before);
  if (change.kind === 'merge' || change.kind === 'unmerge') {
    duplicatePlan(items, change, operationId);
  } else {
    const item = requireItem(items, change.id);
    const graph = graphMetadata(item);
    let next: Item = { ...item, graph };
    switch (change.kind) {
      case 'parent':
        if (change.parentId === null) delete graph.parentId;
        else {
          requireItem(items, change.parentId);
          graph.parentId = change.parentId;
        }
        break;
      case 'dependency': {
        requireItem(items, change.dependencyId);
        const dependencies = new Set(item.dependencies ?? []);
        if (change.action === 'add') dependencies.add(change.dependencyId);
        else dependencies.delete(change.dependencyId);
        next.dependencies = [...dependencies].sort();
        break;
      }
      case 'related': {
        const target = requireItem(items, change.relatedId);
        if (target.id === item.id)
          fail('INVALID_RELATION', 'related link cannot target itself');
        const targetGraph = graphMetadata(target);
        const links = new Set(graph.relatedIds ?? []);
        const other = new Set(targetGraph.relatedIds ?? []);
        if (change.action === 'add') {
          links.add(target.id);
          other.add(item.id);
        } else {
          links.delete(target.id);
          other.delete(item.id);
        }
        graph.relatedIds = [...links].sort();
        targetGraph.relatedIds = [...other].sort();
        items.set(target.id, { ...target, graph: targetGraph });
        break;
      }
      case 'close':
        if (graph.disposition.kind !== 'open')
          fail('INVALID_STATE', 'close requires an open canonical request');
        if (beforeGroups.unverified.has(canonicalId(item)))
          fail(
            'INVALID_EVIDENCE',
            'every unique member obligation needs its own current verification'
          );
        graph.disposition = { kind: 'closed', reason: change.reason };
        break;
      case 'reopen':
        if (graph.disposition.kind === 'duplicate')
          fail(
            'DUPLICATE_CONFLICT',
            'duplicate reopening requires explicit unmerge'
          );
        next = {
          ...revokeVerification(item),
          graph: { ...graph, disposition: { kind: 'open' } },
        };
        break;
      default: {
        const exhaustive: never = change;
        return exhaustive;
      }
    }
    items.set(item.id, next);
  }
  invalidateGraphVerification(items);
  validateOutcomeGraph(items);
  const changed = changedItems(before, items);
  return {
    result: { changedIds: changed.map((item) => item.id) },
    events: changed.map((item) => ({ item, action: `graph-${change.kind}` })),
  };
}
