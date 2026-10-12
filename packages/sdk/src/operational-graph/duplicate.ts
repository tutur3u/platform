import { canonical, fail, type Item } from '../cli/operational-schema';
import type { GraphCommand } from './contracts';

export function canonicalId(item: Item): string {
  const disposition = item.graph?.disposition;
  return disposition?.kind === 'duplicate' ? disposition.canonicalId : item.id;
}
export function groupMembers(items: Map<string, Item>, id: string): Item[] {
  const item = requireItem(items, id);
  const root = canonicalId(item);
  return [...items.values()]
    .filter((member) => canonicalId(member) === root)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  item: Item
): string[] {
  return (item.dependencies ?? []).filter((id) => {
    const dependency = items.get(id);
    return (
      !dependency ||
      groupMembers(items, id).some((member) => member.status !== 'verified')
    );
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
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...items.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    )) {
      if (item.status !== 'verified') continue;
      const pending = pendingDependencies(items, item);
      const closedGroupPending =
        item.graph?.disposition.kind === 'closed' &&
        groupMembers(items, item.id).some(
          (member) => member.status !== 'verified'
        );
      if (!pending.length && !closedGroupPending) continue;
      const next = {
        ...revokeVerification(item),
        invalidatedDependencies: pending,
      };
      items.set(item.id, next);
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
      groupMembers(items, id).some(
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
