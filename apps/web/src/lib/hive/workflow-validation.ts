import type {
  HiveWorkflowDefinition,
  HiveWorkflowEdge,
  HiveWorkflowNode,
} from './workflow-types';

const MAX_WORKFLOW_NODES = 80;
const MAX_WORKFLOW_EDGES = 120;

export function validateHiveWorkflowDefinition(
  definition: HiveWorkflowDefinition
) {
  const errors: string[] = [];
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];

  if (definition.version !== 1) {
    errors.push('Hive workflow definitions must use version 1.');
  }

  if (nodes.length > MAX_WORKFLOW_NODES) {
    errors.push(`Hive workflows are limited to ${MAX_WORKFLOW_NODES} nodes.`);
  }

  if (edges.length > MAX_WORKFLOW_EDGES) {
    errors.push(`Hive workflows are limited to ${MAX_WORKFLOW_EDGES} edges.`);
  }

  const nodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.id || nodeIds.has(node.id)) {
      errors.push('Workflow node ids must be unique.');
      break;
    }
    nodeIds.add(node.id);
  }

  if (!nodes.some((node) => node.type === 'manual_trigger')) {
    errors.push('Workflow needs a manual trigger node.');
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push('Workflow edges must connect existing nodes.');
      break;
    }
  }

  if (hasCycle(nodes, edges)) {
    errors.push('Workflow graphs cannot contain cycles.');
  }

  return {
    errors,
    ok: errors.length === 0,
  };
}

function hasCycle(nodes: HiveWorkflowNode[], edges: HiveWorkflowEdge[]) {
  const outgoing = groupHiveWorkflowEdgesBySource(edges);
  const state = new Map<string, 'done' | 'visiting'>();

  const visit = (nodeId: string): boolean => {
    const current = state.get(nodeId);
    if (current === 'visiting') return true;
    if (current === 'done') return false;

    state.set(nodeId, 'visiting');
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (visit(edge.target)) return true;
    }
    state.set(nodeId, 'done');
    return false;
  };

  return nodes.some((node) => visit(node.id));
}

export function groupHiveWorkflowEdgesBySource(edges: HiveWorkflowEdge[]) {
  const outgoing = new Map<string, HiveWorkflowEdge[]>();
  for (const edge of edges) {
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge);
    outgoing.set(edge.source, current);
  }
  return outgoing;
}
