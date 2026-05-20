import type {
  MindAiPatch,
  MindBoardSnapshot,
  MindEdge,
  MindNode,
} from './types';

const NOW = '1970-01-01T00:00:00.000Z';

function createNode(node: Parameters<typeof normalizeNode>[0]) {
  return normalizeNode(node);
}

function normalizeNode(
  node: Partial<MindNode> &
    Pick<MindNode, 'id' | 'positionX' | 'positionY' | 'title'>
): MindNode {
  return {
    body: node.body ?? null,
    color: node.color ?? null,
    createdAt: node.createdAt ?? NOW,
    height: node.height ?? 120,
    horizon: node.horizon ?? 'year',
    id: node.id,
    metadata: node.metadata ?? {},
    nodeType: node.nodeType ?? 'idea',
    parentNodeId: node.parentNodeId ?? null,
    positionX: node.positionX,
    positionY: node.positionY,
    status: node.status ?? 'planned',
    title: node.title,
    updatedAt: node.updatedAt ?? NOW,
    width: node.width ?? 240,
  };
}

function normalizeEdge(
  edge: Partial<MindEdge> &
    Pick<MindEdge, 'id' | 'sourceNodeId' | 'targetNodeId'>
): MindEdge {
  return {
    color: edge.color ?? null,
    createdAt: edge.createdAt ?? NOW,
    edgeType: edge.edgeType ?? 'relates_to',
    id: edge.id,
    label: edge.label ?? null,
    metadata: edge.metadata ?? {},
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    updatedAt: edge.updatedAt ?? NOW,
    weight: edge.weight ?? 1,
  };
}

export function applyMindPatchToSnapshot(
  snapshot: MindBoardSnapshot,
  patch: MindAiPatch
): MindBoardSnapshot {
  let nodes = snapshot.nodes.map((node) => ({ ...node }));
  let edges = snapshot.edges.map((edge) => ({ ...edge }));

  for (const operation of patch.operations) {
    if (operation.kind === 'create_node') {
      const nextNode = createNode(operation.node);
      nodes = [...nodes.filter((node) => node.id !== nextNode.id), nextNode];
      continue;
    }

    if (operation.kind === 'update_node') {
      nodes = nodes.map((node) =>
        node.id === operation.nodeId
          ? {
              ...node,
              ...Object.fromEntries(
                Object.entries(operation).filter(
                  ([key, value]) =>
                    key !== 'id' &&
                    key !== 'kind' &&
                    key !== 'nodeId' &&
                    value !== undefined
                )
              ),
            }
          : node
      );
      continue;
    }

    if (operation.kind === 'delete_node') {
      nodes = nodes.filter((node) => node.id !== operation.nodeId);
      edges = edges.filter(
        (edge) =>
          edge.sourceNodeId !== operation.nodeId &&
          edge.targetNodeId !== operation.nodeId
      );
      continue;
    }

    if (operation.kind === 'create_edge') {
      const nextEdge = normalizeEdge(operation.edge);
      edges = [...edges.filter((edge) => edge.id !== nextEdge.id), nextEdge];
      continue;
    }

    if (operation.kind === 'update_edge') {
      edges = edges.map((edge) =>
        edge.id === operation.edgeId
          ? {
              ...edge,
              ...Object.fromEntries(
                Object.entries(operation).filter(
                  ([key, value]) =>
                    key !== 'edgeId' &&
                    key !== 'id' &&
                    key !== 'kind' &&
                    value !== undefined
                )
              ),
            }
          : edge
      );
      continue;
    }

    if (operation.kind === 'delete_edge') {
      edges = edges.filter((edge) => edge.id !== operation.edgeId);
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    ...snapshot,
    edges: edges.filter(
      (edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)
    ),
    nodes,
  };
}
