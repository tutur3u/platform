import { canonical, fail, type Item } from '../cli/operational-schema';
import type { GraphCommand } from './contracts';

export function canonicalId(item: Item): string {
  const disposition = item.graph?.disposition;
  return disposition?.kind === 'duplicate' ? disposition.canonicalId : item.id;
}
export function groupIndex(items: Map<string, Item>) {
  const members = new Map<string, Item[]>();
  const unverified = new Set<string>();
  const positions = new Map<string, number>();
  for (const item of items.values()) {
    const root = canonicalId(item);
    const group = members.get(root) ?? [];
    group.push(item);
    members.set(root, group);
    if (item.status !== 'verified') unverified.add(root);
  }
  for (const group of members.values()) {
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    group.forEach((item, position) => {
      positions.set(item.id, position);
    });
  }
  return { members, unverified, positions };
}
export function groupMembers(
  items: Map<string, Item>,
  id: string,
  groups = groupIndex(items)
): Item[] {
  const item = requireItem(items, id);
  return groups.members.get(canonicalId(item)) ?? [];
}
export function requireItem(items: Map<string, Item>, id: string): Item {
  const item = items.get(id);
  if (!item) fail('UNKNOWN_ID', `unknown request ${id}`);
  return item;
}
export function graphMetadata(item: Item): NonNullable<Item['graph']> {
  return item.graph
    ? structuredClone(item.graph)
    : { version: 1, disposition: { kind: 'open' } };
}
export function pendingDependencies(
  items: Map<string, Item>,
  item: Item,
  groups = groupIndex(items)
): string[] {
  return (item.dependencies ?? []).filter((id) => {
    const dependency = items.get(id);
    return !dependency || groups.unverified.has(canonicalId(dependency));
  });
}
export function revokeVerification(item: Item): Item {
  if (item.status !== 'verified') return { ...item };
  const next: Item = { ...item, status: 'implemented' };
  delete next.verification;
  if (next.graph?.disposition.kind === 'closed')
    next.graph = { ...next.graph, disposition: { kind: 'open' } };
  return next;
}
export function invalidateGraphVerification(items: Map<string, Item>) {
  const events: { item: Item; action: string }[] = [];
  const groups = groupIndex(items);
  const orderedIds = [...items.keys()].sort();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of orderedIds) {
      const item = requireItem(items, id);
      if (item.status !== 'verified') continue;
      const pending = pendingDependencies(items, item, groups);
      const closedGroupPending =
        item.graph?.disposition.kind === 'closed' &&
        groups.unverified.has(canonicalId(item));
      if (!pending.length && !closedGroupPending) continue;
      const next = {
        ...revokeVerification(item),
        invalidatedDependencies: pending,
      };
      items.set(item.id, next);
      const root = canonicalId(next);
      const group = groups.members.get(root);
      const position = groups.positions.get(next.id);
      if (!group || position === undefined)
        fail(
          'INVALID_STATE',
          'invalidated member missing from canonical index'
        );
      group[position] = next;
      groups.unverified.add(root);
      events.push({ item: next, action: 'graph-dependency-invalidated' });
      changed = true;
    }
  }
  return events;
}

export function duplicatePlan(
  items: Map<string, Item>,
  change: Extract<GraphCommand, { kind: 'merge' | 'unmerge' }>,
  operationId: string
) {
  if (change.kind === 'unmerge') {
    const item = requireItem(items, change.id);
    const disposition = item.graph?.disposition;
    if (
      disposition?.kind !== 'duplicate' ||
      disposition.mergeOperationId !== change.mergeOperationId
    )
      fail(
        'DUPLICATE_CONFLICT',
        'unmerge requires the current explicit merge operation'
      );
    const next = revokeVerification(item);
    next.graph = { ...graphMetadata(item), disposition: { kind: 'open' } };
    items.set(item.id, next);
    return;
  }
  const root = requireItem(items, change.canonicalId);
  if (root.graph && root.graph.disposition.kind !== 'open')
    fail(
      'DUPLICATE_CONFLICT',
      'canonical target must be open and cannot be another duplicate'
    );
  if (change.memberIds.includes(root.id))
    fail(
      'DUPLICATE_CONFLICT',
      'canonical target cannot be one of its duplicate members'
    );
  const selected = new Set(change.memberIds);
  const groups = groupIndex(items);
  for (const id of change.memberIds) {
    const member = requireItem(items, id);
    const current = member.graph?.disposition;
    if (current?.kind === 'closed')
      fail('DUPLICATE_CONFLICT', 'closed member needs explicit reopen');
    if (current?.kind === 'duplicate') {
      if (current.canonicalId === root.id && current.reason === change.reason)
        continue;
      if (!selected.has(current.canonicalId))
        fail(
          'DUPLICATE_CONFLICT',
          'all members and their former canonical target must be explicitly selected'
        );
    }
    if (
      groupMembers(items, id, groups).some(
        (other) => other.id !== root.id && !selected.has(other.id)
      )
    )
      fail(
        'DUPLICATE_CONFLICT',
        'merge must explicitly include the complete contributing group'
      );
  }
  for (const id of change.memberIds) {
    const member = requireItem(items, id);
    const current = member.graph?.disposition;
    if (
      current?.kind === 'duplicate' &&
      current.canonicalId === root.id &&
      current.reason === change.reason
    )
      continue;
    items.set(id, {
      ...member,
      graph: {
        ...graphMetadata(member),
        disposition: {
          kind: 'duplicate',
          canonicalId: root.id,
          mergeOperationId: operationId,
          reason: change.reason,
        },
      },
    });
  }
}

export function changedItems(
  before: Map<string, Item>,
  after: Map<string, Item>
) {
  return [...after.values()]
    .filter(
      (item) => canonical(requireItem(before, item.id)) !== canonical(item)
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
