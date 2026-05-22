import type {
  HiveWorkflowDefinition,
  HiveWorkflowNode,
  HiveWorkflowNodeType,
} from '@tuturuuu/internal-api/hive';
import type { Connection, Edge, Node } from '@xyflow/react';

export type WorkflowFlowNode = Node<
  HiveWorkflowNode['data'],
  HiveWorkflowNodeType
>;

export function fromDefinitionNodes(
  definition: HiveWorkflowDefinition
): WorkflowFlowNode[] {
  return definition.nodes.map((node) => ({
    ...node,
    type: node.type,
  }));
}

export function fromDefinitionEdges(
  definition: HiveWorkflowDefinition
): Edge[] {
  return definition.edges.map((edge) => ({ ...edge }));
}

export function toWorkflowNode(node: WorkflowFlowNode): HiveWorkflowNode {
  return {
    data: node.data,
    id: node.id,
    position: node.position,
    type: node.type as HiveWorkflowNodeType,
  };
}

export function toDefinition(
  nodes: WorkflowFlowNode[],
  edges: Edge[]
): HiveWorkflowDefinition {
  return {
    edges: edges.map((edge) => ({
      id: edge.id,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    })),
    nodes: nodes.map(toWorkflowNode),
    version: 1,
  };
}

export function validateDraftDefinition(
  definition: HiveWorkflowDefinition,
  messages: {
    cycle: string;
    danglingEdge: string;
    edgeLimit: string;
    missingTrigger: string;
    nodeLimit: string;
  }
) {
  const errors: string[] = [];
  const nodeIds = new Set(definition.nodes.map((node) => node.id));

  if (!definition.nodes.some((node) => node.type === 'manual_trigger')) {
    errors.push(messages.missingTrigger);
  }
  if (definition.nodes.length > 80) {
    errors.push(messages.nodeLimit);
  }
  if (definition.edges.length > 120) {
    errors.push(messages.edgeLimit);
  }
  if (
    definition.edges.some(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    )
  ) {
    errors.push(messages.danglingEdge);
  }
  if (hasDraftCycle(definition)) {
    errors.push(messages.cycle);
  }
  return errors;
}

export function isValidWorkflowConnection(
  connection: Connection | Edge,
  nodes: WorkflowFlowNode[],
  edges: Edge[]
) {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;

  if (
    edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? null) === sourceHandle
    )
  ) {
    return false;
  }

  return !hasDraftCycle(
    toDefinition(nodes, [
      ...edges,
      {
        id: '__candidate__',
        source: connection.source,
        sourceHandle,
        target: connection.target,
        targetHandle,
      },
    ])
  );
}

function hasDraftCycle(definition: HiveWorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges) {
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge.target);
    outgoing.set(edge.source, current);
  }

  const state = new Map<string, 'done' | 'visiting'>();
  const visit = (nodeId: string): boolean => {
    const current = state.get(nodeId);
    if (current === 'visiting') return true;
    if (current === 'done') return false;

    state.set(nodeId, 'visiting');
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    state.set(nodeId, 'done');
    return false;
  };

  return definition.nodes.some((node) => visit(node.id));
}
