import { fail, type Operation } from '../cli/operational-schema';
import type { OperationalStore } from '../cli/operational-store';
import { type GraphCommand, graphCommandSchema } from './contracts';
import { graphPlan, graphReadiness, validateOutcomeGraph } from './domain';
import {
  canonicalId,
  groupIndex,
  groupMembers,
  requireItem,
} from './duplicate';

export function applyGraphCommand({
  store,
  change: input,
  operation,
}: {
  store: OperationalStore;
  change: GraphCommand;
  operation: Operation;
}) {
  if (store.kind !== 'backlog')
    fail('STORE_KIND_MISMATCH', 'graph commands require a backlog store');
  const change = graphCommandSchema.parse(input);
  return store.mutate(operation, { command: 'graph', change }, () => {
    const plan = graphPlan(store.readItems(), change, operation.operationId);
    for (const event of plan.events) store.append(event.item, event.action);
    return plan.result;
  });
}

export function readGraphReadiness({
  store,
  id,
}: {
  store: OperationalStore;
  id: string;
}) {
  if (store.kind !== 'backlog' || store.writable)
    fail('READ_ONLY', 'readiness requires a read-only backlog store');
  return store.read(() => ({
    ...graphReadiness(store.readItems(), id),
    revision: store.revision(),
    sourceDatabaseId: store.identity(),
  }));
}

export function readGraphOutcome({
  store,
  id,
}: {
  store: OperationalStore;
  id: string;
}) {
  if (store.kind !== 'backlog' || store.writable)
    fail('READ_ONLY', 'graph navigation requires a read-only backlog store');
  return store.read(() => {
    const items = store.readItems();
    const groups = groupIndex(items);
    validateOutcomeGraph(items, groups);
    const item = requireItem(items, id);
    const root = canonicalId(item);
    return {
      id,
      canonicalId: root,
      members: groupMembers(items, id, groups),
      children: [...items.values()]
        .filter((child) => {
          const parentId = child.graph?.parentId;
          return (
            parentId !== undefined &&
            canonicalId(requireItem(items, parentId)) === root
          );
        })
        .map((child) => child.id)
        .sort(),
      readiness: graphReadiness(items, id, groups),
      revision: store.revision(),
      sourceDatabaseId: store.identity(),
      liveVerificationPerformed: false,
    };
  });
}
