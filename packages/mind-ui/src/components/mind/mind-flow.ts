import type { SaveMindGraphPayload } from '@tuturuuu/internal-api/mind';
import type { MindEdge, MindJsonObject, MindNode } from '@tuturuuu/types/db';
import { type Edge, MarkerType, type Node } from '@xyflow/react';
import type { MindFlowNodeData } from './mind-node-card';

export type MindFlowNode = Node<MindFlowNodeData, 'mindNode'>;
export type MindEdgeObstacle = {
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
};
export type MindFlowEdgeData = Record<string, unknown> & {
  dimmed?: boolean;
  edge: MindEdge;
  focused?: boolean;
  labelLane?: number;
  labelObstacles?: MindEdgeObstacle[];
  onHoverEdge?: (edgeId: string | null) => void;
  onSelectEdge?: (edgeId: string) => void;
  obstacles?: MindEdgeObstacle[];
};
export type MindFlowEdge = Edge<MindFlowEdgeData>;
export type MindGroupFrame = {
  anchorNodeId: string;
  childCount: number;
  color: string;
  height: number;
  id: string;
  kind: 'children' | 'cluster';
  level: number;
  parentTitle: string;
  title: string;
  width: number;
  x: number;
  y: number;
};

const CARD_WIDTH = 280;
const CARD_HEIGHT = 168;
const CLUSTER_GAP_X = 320;
const CHILD_FRAME_PADDING_X = 32;
const CHILD_FRAME_PADDING_Y = 34;
const CLUSTER_FRAME_PADDING = 36;
const MAX_DYNAMIC_PADDING = 56;
const LEVEL_GAP_Y = 220;
const NODE_GAP_X = 180;
const ANCHOR_GAP_X = 120;
const HANDLE_DIRECTION_PENALTY = 640;
const HANDLE_USAGE_PENALTY = 48;
const RELATION_COLORS: Record<MindEdge['edgeType'], string> = {
  blocks: '#ef4444',
  contains: '#2f80ed',
  contradicts: '#f97316',
  custom: '#8b5cf6',
  depends_on: '#f59e0b',
  reference: '#64748b',
  relates_to: '#94a3b8',
  sequence: '#38bdf8',
  supports: '#22c55e',
};
const ROOT_NODE_TYPES = new Set<MindNode['nodeType']>([
  'goal',
  'milestone',
  'plan',
  'system',
]);
export const MIND_CONNECTION_HANDLE_PREFIX = 'connection-';
const SOURCE_FRAME_ID_METADATA_KEY = 'sourceFrameId';
const TARGET_FRAME_ID_METADATA_KEY = 'targetFrameId';

const naturalSort = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function toFlowNodes(nodes: MindNode[]): MindFlowNode[] {
  return nodes.map(toFlowNode);
}

export function toFlowNode(node: MindNode): MindFlowNode {
  return {
    data: { node },
    id: node.id,
    position: { x: node.positionX, y: node.positionY },
    type: 'mindNode',
  };
}

export function toFlowEdges(edges: MindEdge[]): MindFlowEdge[] {
  return toFlowEdgesWithNodes(edges);
}

export function toFlowEdgesWithNodes(
  edges: MindEdge[],
  nodes: MindFlowNode[] | MindNode[] = []
): MindFlowEdge[] {
  const nodeById = new Map(
    nodes.map((node) => {
      if ('data' in node) return [node.id, node.data.node] as const;
      return [node.id, node] as const;
    })
  );
  const usage = createHandleUsage();
  const allNodeObstacles = [...nodeById.values()].map(toEdgeObstacle);

  return edges.map((edge) =>
    toFlowEdge(
      edge,
      nodeById,
      usage,
      allNodeObstacles.filter(
        (obstacle) =>
          obstacle.id !== edge.sourceNodeId && obstacle.id !== edge.targetNodeId
      ),
      allNodeObstacles
    )
  );
}

export function toFlowEdge(
  edge: MindEdge,
  nodeById = new Map<string, MindNode>(),
  usage = createHandleUsage(),
  obstacles: MindEdgeObstacle[] = [],
  labelObstacles: MindEdgeObstacle[] = obstacles
): MindFlowEdge {
  const color = edge.color ?? RELATION_COLORS[edge.edgeType];
  const isSequence = edge.edgeType === 'sequence';
  const isContainment = edge.edgeType === 'contains';
  const label =
    edge.label ??
    (isSequence || isContainment
      ? undefined
      : edge.edgeType.replaceAll('_', ' '));
  const route = chooseEdgeRoute(edge, nodeById, usage);

  return {
    data: { edge, labelObstacles, obstacles },
    id: edge.id,
    interactionWidth: 24,
    label,
    labelBgPadding: [6, 4],
    labelBgStyle: {
      fill: 'var(--background)',
      fillOpacity: 0.98,
      stroke: color,
      strokeOpacity: 0.48,
    },
    labelStyle: {
      fill: 'var(--foreground)',
      fontSize: 11,
      fontWeight: 600,
    },
    markerEnd: {
      color,
      type: MarkerType.ArrowClosed,
    },
    sourceHandle: getMindConnectionHandleId(route.sourceSide),
    source: edge.sourceNodeId,
    style: {
      stroke: color,
      strokeOpacity: isSequence ? 0.82 : 0.9,
      strokeWidth: isContainment ? 2.4 : isSequence ? 2 : 1.8,
    },
    targetHandle: getMindConnectionHandleId(route.targetSide),
    target: edge.targetNodeId,
    type: 'mindRelationship',
  };
}
export function createMindNode({
  boardHorizon,
  id,
  title,
  x,
  y,
}: {
  boardHorizon: MindNode['horizon'];
  id: string;
  title: string;
  x: number;
  y: number;
}): MindNode {
  const now = new Date().toISOString();
  return {
    body: null,
    color: '#2f80ed',
    createdAt: now,
    height: 120,
    horizon: boardHorizon,
    id,
    metadata: {},
    nodeType: 'idea',
    parentNodeId: null,
    positionX: x,
    positionY: y,
    status: 'planned',
    title,
    updatedAt: now,
    width: 240,
  };
}

export function createMindEdge(
  source?: string | null,
  target?: string | null
): MindEdge {
  const now = new Date().toISOString();
  return {
    color: null,
    createdAt: now,
    edgeType: 'relates_to',
    id: crypto.randomUUID(),
    label: null,
    metadata: {},
    sourceNodeId: source ?? '',
    targetNodeId: target ?? '',
    updatedAt: now,
    weight: 1,
  };
}

export function createMindConnectionEdge({
  frames,
  source,
  target,
}: {
  frames: MindGroupFrame[];
  source?: string | null;
  target?: string | null;
}) {
  const sourceEndpoint = resolveMindConnectionEndpoint(source, frames);
  const targetEndpoint = resolveMindConnectionEndpoint(target, frames);
  if (!sourceEndpoint || !targetEndpoint) return null;
  if (
    sourceEndpoint.nodeId === targetEndpoint.nodeId &&
    !sourceEndpoint.frameId &&
    !targetEndpoint.frameId
  ) {
    return null;
  }

  const edge = createMindEdge(sourceEndpoint.nodeId, targetEndpoint.nodeId);
  const metadata: MindJsonObject = {};
  if (sourceEndpoint.frameId) {
    metadata[SOURCE_FRAME_ID_METADATA_KEY] = sourceEndpoint.frameId;
  }
  if (targetEndpoint.frameId) {
    metadata[TARGET_FRAME_ID_METADATA_KEY] = targetEndpoint.frameId;
  }

  return {
    ...edge,
    metadata,
  } satisfies MindEdge;
}

export function getMindConnectionHandleId(side: EdgeSide) {
  return `${MIND_CONNECTION_HANDLE_PREFIX}${side}`;
}

export function getMindEdgeFrameEndpoint(
  edge: MindEdge,
  endpoint: 'source' | 'target'
) {
  const key =
    endpoint === 'source'
      ? SOURCE_FRAME_ID_METADATA_KEY
      : TARGET_FRAME_ID_METADATA_KEY;
  const value = edge.metadata[key];
  return typeof value === 'string' && value ? value : null;
}

function resolveMindConnectionEndpoint(
  id: string | null | undefined,
  frames: MindGroupFrame[]
) {
  if (!id) return null;

  const frame = frames.find((item) => item.id === id);
  if (frame) {
    return {
      frameId: frame.id,
      nodeId: frame.anchorNodeId,
    };
  }

  return {
    frameId: null,
    nodeId: id,
  };
}

export function getVisibleFlowNodes({
  horizon,
  nodes,
  selectedTags,
}: {
  horizon: string;
  nodes: MindFlowNode[];
  selectedTags: string[];
}) {
  const selected = new Set(selectedTags.map((tag) => tag.toLowerCase()));

  return nodes.filter((node) => {
    const mindNode = node.data.node;
    const nodeTags = Array.isArray(mindNode.metadata.tags)
      ? mindNode.metadata.tags
      : [];
    const matchesHorizon = horizon === 'all' || mindNode.horizon === horizon;
    const matchesTag =
      selected.size === 0 ||
      nodeTags.some((tag) => selected.has(String(tag).toLowerCase()));

    return matchesHorizon && matchesTag;
  });
}

export function getVisibleFlowEdges({
  edges,
  nodes,
}: {
  edges: MindFlowEdge[];
  nodes: MindFlowNode[];
}) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
  const baseById = new Map(visibleEdges.map((edge) => [edge.id, edge]));
  const routedEdges = toFlowEdgesWithNodes(
    visibleEdges.flatMap((edge) => (edge.data?.edge ? [edge.data.edge] : [])),
    nodes.map((node) => ({
      ...node.data.node,
      positionX: node.position.x,
      positionY: node.position.y,
    }))
  );

  return routedEdges.map((edge) => {
    const base = baseById.get(edge.id);
    if (!base) return edge;
    return { ...base, ...edge, selected: base.selected };
  });
}

export function toSaveMindGraphPayload({
  deletedEdgeIds,
  deletedNodeIds,
  edges,
  nodes,
}: {
  deletedEdgeIds: string[];
  deletedNodeIds: string[];
  edges: MindFlowEdge[];
  nodes: MindFlowNode[];
}): SaveMindGraphPayload {
  return {
    deletedEdgeIds,
    deletedNodeIds,
    edges: edges.flatMap((edge) => (edge.data?.edge ? [edge.data.edge] : [])),
    nodes: nodes.map((node) => ({
      ...node.data.node,
      positionX: node.position.x,
      positionY: node.position.y,
    })),
  };
}

export function organizeMindLayout({
  edges,
  nodes,
}: {
  edges: MindFlowEdge[];
  nodes: MindFlowNode[];
}) {
  const graph = buildLayoutGraph(nodes, edges);
  const next = new Map(nodes.map((node) => [node.id, node]));
  const nodeById = new Map(nodes.map((node) => [node.id, node.data.node]));
  const anchoredRoots = buildAnchoredRootMap({ edges, graph, nodeById });
  const anchoredRootIds = new Set([...anchoredRoots.values()].flat());
  const laneRootIds = sortRootLaneIds(
    graph.roots.filter((rootId) => !anchoredRootIds.has(rootId)),
    edges,
    nodeById
  );
  const layoutTrees = new Map(
    laneRootIds.map((rootId) => [
      rootId,
      buildLayoutTree(rootId, graph.childrenByParent),
    ])
  );
  let cursorX = 0;

  for (const rootId of laneRootIds) {
    const tree = layoutTrees.get(rootId);
    if (!tree) continue;
    placeLayoutTree(tree, cursorX, 0, next);
    cursorX += tree.width + CLUSTER_GAP_X;
  }

  for (const [anchorId, anchoredIds] of anchoredRoots.entries()) {
    const anchorNode = next.get(anchorId);
    if (!anchorNode) continue;

    const orderedAnchoredIds = sortNodeIdsBySequence(
      anchoredIds,
      edges,
      nodeById
    );
    const rowWidth =
      orderedAnchoredIds.length * CARD_WIDTH +
      Math.max(0, orderedAnchoredIds.length - 1) * NODE_GAP_X;
    const rowX =
      anchorNode.position.x + CARD_WIDTH / 2 - rowWidth / 2 + ANCHOR_GAP_X;
    const depth = getSubtreeDepth(anchorId, graph.childrenByParent);
    const rowY =
      anchorNode.position.y + (depth + 1) * (CARD_HEIGHT + LEVEL_GAP_Y);

    orderedAnchoredIds.forEach((nodeId, index) => {
      const node = next.get(nodeId);
      if (!node) return;

      const x = rowX + index * (CARD_WIDTH + NODE_GAP_X);
      const y = rowY;
      next.set(nodeId, {
        ...node,
        data: {
          node: {
            ...node.data.node,
            positionX: x,
            positionY: y,
          },
        },
        position: { x, y },
      });
    });
  }

  return nodes.map((node) => next.get(node.id) ?? node);
}

export function getMindGroupFrames({
  edges,
  nodes,
}: {
  edges: MindFlowEdge[];
  nodes: MindFlowNode[];
}): MindGroupFrame[] {
  const graph = buildLayoutGraph(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const frames = graph.roots.flatMap((rootId) => {
    const memberIds = buildClusterLevels(rootId, graph.childrenByParent).flat();
    const root = nodeById.get(rootId)?.data.node;
    const descendants = memberIds.filter((nodeId) => nodeId !== rootId);
    const frames: MindGroupFrame[] = [];

    if (descendants.length > 0) {
      const dynamicClusterPadding =
        CLUSTER_FRAME_PADDING +
        Math.min(MAX_DYNAMIC_PADDING, descendants.length * 8);
      const clusterFrame = createFrame({
        anchorNodeId: rootId,
        childCount: descendants.length,
        color: root?.color ?? '#2f80ed',
        ids: memberIds,
        id: `mind-cluster-frame-${rootId}`,
        kind: 'cluster',
        level: 0,
        nodeById,
        paddingX: dynamicClusterPadding,
        paddingY: dynamicClusterPadding,
        parentTitle: root?.title ?? '',
        title: root?.title ?? '',
      });
      if (clusterFrame) frames.push(clusterFrame);
    }

    const parentIds = memberIds.filter(
      (nodeId) => (graph.childrenByParent.get(nodeId) ?? []).length > 0
    );
    for (const parentId of parentIds) {
      const childIds = graph.childrenByParent.get(parentId) ?? [];
      const parent = nodeById.get(parentId)?.data.node;
      const dynamicChildPaddingX =
        CHILD_FRAME_PADDING_X +
        Math.min(MAX_DYNAMIC_PADDING, childIds.length * 6);
      const dynamicChildPaddingY =
        CHILD_FRAME_PADDING_Y +
        Math.min(MAX_DYNAMIC_PADDING, childIds.length * 5);
      const childFrame = createFrame({
        anchorNodeId: parentId,
        childCount: childIds.length,
        color: parent?.color ?? root?.color ?? '#2f80ed',
        ids: childIds,
        id: `mind-children-frame-${parentId}`,
        kind: 'children',
        level: Math.max(1, findNodeLevel(parentId, graph.childrenByParent)),
        nodeById,
        paddingX: dynamicChildPaddingX,
        paddingY: dynamicChildPaddingY,
        parentTitle: parent?.title ?? '',
        title: parent?.title ?? '',
      });
      if (childFrame) frames.push(childFrame);
    }

    return frames;
  });

  return frames.sort((a, b) => a.id.localeCompare(b.id));
}

function createFrame({
  childCount,
  anchorNodeId,
  color,
  ids,
  id,
  kind,
  level,
  nodeById,
  paddingX,
  paddingY,
  parentTitle,
  title,
}: {
  anchorNodeId: string;
  childCount: number;
  color: string;
  ids: string[];
  id: string;
  kind: MindGroupFrame['kind'];
  level: number;
  nodeById: Map<string, MindFlowNode>;
  paddingX: number;
  paddingY: number;
  parentTitle: string;
  title: string;
}) {
  const members = ids.flatMap((nodeId) => {
    const node = nodeById.get(nodeId);
    return node ? [node] : [];
  });
  if (members.length < 1) return null;

  const minX = Math.min(...members.map((node) => node.position.x));
  const minY = Math.min(...members.map((node) => node.position.y));
  const maxX = Math.max(...members.map((node) => node.position.x));
  const maxY = Math.max(...members.map((node) => node.position.y));

  return {
    anchorNodeId,
    childCount,
    color,
    height: maxY - minY + CARD_HEIGHT + paddingY * 2,
    id,
    kind,
    level,
    parentTitle,
    title,
    width: maxX - minX + CARD_WIDTH + paddingX * 2,
    x: minX - paddingX,
    y: minY - paddingY,
  } satisfies MindGroupFrame;
}

function findNodeLevel(
  nodeId: string,
  childrenByParent: Map<string, string[]>
) {
  let level = 0;
  let current = [nodeId];
  const seen = new Set(current);

  while (current.length > 0) {
    const parents = [...childrenByParent.entries()]
      .filter(([, children]) =>
        children.some((childId) => current.includes(childId))
      )
      .map(([parentId]) => parentId)
      .filter((parentId) => !seen.has(parentId));
    if (parents.length === 0) return level;
    parents.forEach((parentId) => {
      seen.add(parentId);
    });
    current = parents;
    level += 1;
  }

  return level;
}

function buildLayoutGraph(nodes: MindFlowNode[], edges: MindFlowEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node.data.node]));
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();

  for (const node of nodes) {
    const parentId = node.data.node.parentNodeId;
    if (parentId && nodeById.has(parentId)) {
      parentByChild.set(node.id, parentId);
    }
  }

  for (const edge of edges) {
    if (
      edge.data?.edge.edgeType !== 'contains' ||
      parentByChild.has(edge.target) ||
      !nodeById.has(edge.source)
    )
      continue;

    parentByChild.set(edge.target, edge.source);
  }

  for (const [childId, parentId] of parentByChild.entries()) {
    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      childId,
    ]);
  }

  for (const [parentId, childIds] of childrenByParent.entries()) {
    childrenByParent.set(
      parentId,
      sortNodeIdsBySequence(childIds, edges, nodeById)
    );
  }

  const roots = sortNodeIds(
    nodes.map((node) => node.id).filter((nodeId) => !parentByChild.has(nodeId)),
    nodeById
  );

  return { childrenByParent, parentByChild, roots };
}

type LayoutTree = {
  children: LayoutTree[];
  id: string;
  width: number;
};

function buildLayoutTree(
  nodeId: string,
  childrenByParent: Map<string, string[]>,
  seen = new Set<string>()
): LayoutTree {
  if (seen.has(nodeId)) return { children: [], id: nodeId, width: CARD_WIDTH };
  seen.add(nodeId);

  const children = (childrenByParent.get(nodeId) ?? []).map((childId) =>
    buildLayoutTree(childId, childrenByParent, new Set(seen))
  );
  const childrenWidth =
    children.length > 0
      ? children.reduce((sum, child) => sum + child.width, 0) +
        Math.max(0, children.length - 1) * NODE_GAP_X
      : CARD_WIDTH;

  return {
    children,
    id: nodeId,
    width: Math.max(CARD_WIDTH, childrenWidth),
  };
}

function placeLayoutTree(
  tree: LayoutTree,
  x: number,
  y: number,
  nodes: Map<string, MindFlowNode>
) {
  const node = nodes.get(tree.id);
  if (!node) return;

  const nodeX = x + tree.width / 2 - CARD_WIDTH / 2;
  nodes.set(tree.id, {
    ...node,
    data: {
      node: {
        ...node.data.node,
        positionX: nodeX,
        positionY: y,
      },
    },
    position: { x: nodeX, y },
  });

  if (tree.children.length === 0) return;

  const childrenWidth =
    tree.children.reduce((sum, child) => sum + child.width, 0) +
    Math.max(0, tree.children.length - 1) * NODE_GAP_X;
  let childX = x + (tree.width - childrenWidth) / 2;
  const childY = y + CARD_HEIGHT + LEVEL_GAP_Y;

  for (const child of tree.children) {
    placeLayoutTree(child, childX, childY, nodes);
    childX += child.width + NODE_GAP_X;
  }
}

function buildAnchoredRootMap({
  edges,
  graph,
  nodeById,
}: {
  edges: MindFlowEdge[];
  graph: ReturnType<typeof buildLayoutGraph>;
  nodeById: Map<string, MindNode>;
}) {
  const rootSet = new Set(graph.roots);
  const anchored = new Map<string, string[]>();

  for (const rootId of graph.roots) {
    const root = nodeById.get(rootId);
    if (!root || ROOT_NODE_TYPES.has(root.nodeType)) continue;

    const anchorId = findBestAnchor(rootId, edges, rootSet, nodeById);
    if (!anchorId) continue;

    anchored.set(anchorId, [...(anchored.get(anchorId) ?? []), rootId]);
  }

  return anchored;
}

function findBestAnchor(
  nodeId: string,
  edges: MindFlowEdge[],
  rootSet: Set<string>,
  nodeById: Map<string, MindNode>
) {
  const candidates = edges
    .flatMap((edge) => {
      const rawEdge = edge.data?.edge;
      if (!rawEdge || rawEdge.edgeType === 'contains') return [];
      if (edge.source === nodeId) return [edge.target];
      if (edge.target === nodeId) return [edge.source];
      return [];
    })
    .filter(
      (candidateId) => candidateId !== nodeId && nodeById.has(candidateId)
    );

  return candidates.sort((a, b) => {
    const aRoot = rootSet.has(a) ? 0 : 1;
    const bRoot = rootSet.has(b) ? 0 : 1;
    if (aRoot !== bRoot) return aRoot - bRoot;

    const aNode = nodeById.get(a);
    const bNode = nodeById.get(b);
    const aRootType = aNode && ROOT_NODE_TYPES.has(aNode.nodeType) ? 0 : 1;
    const bRootType = bNode && ROOT_NODE_TYPES.has(bNode.nodeType) ? 0 : 1;
    if (aRootType !== bRootType) return aRootType - bRootType;

    return naturalSort.compare(aNode?.title ?? a, bNode?.title ?? b);
  })[0];
}

function sortRootLaneIds(
  rootIds: string[],
  edges: MindFlowEdge[],
  nodeById: Map<string, MindNode>
) {
  return sortNodeIdsBySequence(rootIds, edges, nodeById);
}

function sortNodeIdsBySequence(
  nodeIds: string[],
  edges: MindFlowEdge[],
  nodeById: Map<string, MindNode>
) {
  const nodeSet = new Set(nodeIds);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(nodeIds.map((id) => [id, 0]));

  for (const edge of edges) {
    if (
      edge.data?.edge.edgeType !== 'sequence' ||
      !nodeSet.has(edge.source) ||
      !nodeSet.has(edge.target)
    )
      continue;

    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = sortNodeIds(
    nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0),
    nodeById
  );
  const ordered: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    ordered.push(nodeId);

    for (const nextId of sortNodeIds(outgoing.get(nodeId) ?? [], nodeById)) {
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) queue.push(nextId);
    }
  }

  const seen = new Set(ordered);
  return [
    ...ordered,
    ...sortNodeIds(
      nodeIds.filter((id) => !seen.has(id)),
      nodeById
    ),
  ];
}

function getSubtreeDepth(
  nodeId: string,
  childrenByParent: Map<string, string[]>
): number {
  const children = childrenByParent.get(nodeId) ?? [];
  if (children.length === 0) return 0;

  return (
    1 +
    Math.max(
      ...children.map((childId) => getSubtreeDepth(childId, childrenByParent))
    )
  );
}

function buildClusterLevels(
  rootId: string,
  childrenByParent: Map<string, string[]>
): string[][] {
  const levels: string[][] = [[rootId]];
  const visited = new Set([rootId]);
  let current = [rootId];

  while (current.length > 0) {
    const next = current.flatMap((nodeId) =>
      (childrenByParent.get(nodeId) ?? []).filter((childId) => {
        if (visited.has(childId)) return false;
        visited.add(childId);
        return true;
      })
    );
    if (next.length === 0) break;
    levels.push(next);
    current = next;
  }

  return levels;
}

function sortNodeIds(nodeIds: string[], nodeById: Map<string, MindNode>) {
  return [...nodeIds].sort((a, b) => {
    const nodeA = nodeById.get(a);
    const nodeB = nodeById.get(b);
    const rootWeightA = nodeA && ROOT_NODE_TYPES.has(nodeA.nodeType) ? 0 : 1;
    const rootWeightB = nodeB && ROOT_NODE_TYPES.has(nodeB.nodeType) ? 0 : 1;
    if (rootWeightA !== rootWeightB) return rootWeightA - rootWeightB;

    return naturalSort.compare(nodeA?.title ?? a, nodeB?.title ?? b);
  });
}

type EdgeSide = 'bottom' | 'left' | 'right' | 'top';

type HandleUsage = {
  source: Map<string, Record<EdgeSide, number>>;
  target: Map<string, Record<EdgeSide, number>>;
};

function createHandleUsage(): HandleUsage {
  return {
    source: new Map(),
    target: new Map(),
  };
}

function chooseEdgeRoute(
  edge: MindEdge,
  nodeById: Map<string, MindNode>,
  usage: HandleUsage
) {
  const source = nodeById.get(edge.sourceNodeId);
  const target = nodeById.get(edge.targetNodeId);
  if (!source || !target) {
    return { sourceSide: 'right', targetSide: 'left' } satisfies {
      sourceSide: EdgeSide;
      targetSide: EdgeSide;
    };
  }

  const candidates = getRouteCandidates(edge);
  const ranked = candidates
    .map(([sourceSide, targetSide]) => ({
      sourceSide,
      targetSide,
      score:
        getSideDistance(source, target, sourceSide, targetSide) +
        getNaturalSidePenalty(source, target, sourceSide, targetSide) +
        getHandleUse(usage.source, source.id, sourceSide) *
          HANDLE_USAGE_PENALTY +
        getHandleUse(usage.target, target.id, targetSide) *
          HANDLE_USAGE_PENALTY,
    }))
    .sort((a, b) => a.score - b.score);
  const best = ranked[0] ?? { sourceSide: 'right', targetSide: 'left' };

  bumpHandleUse(usage.source, source.id, best.sourceSide);
  bumpHandleUse(usage.target, target.id, best.targetSide);

  return best;
}

function getRouteCandidates(edge: MindEdge): Array<[EdgeSide, EdgeSide]> {
  if (edge.edgeType === 'contains') {
    return [
      ['bottom', 'top'],
      ['top', 'bottom'],
      ['right', 'left'],
      ['left', 'right'],
    ];
  }

  if (edge.edgeType === 'sequence') {
    return [
      ['right', 'left'],
      ['left', 'right'],
      ['bottom', 'top'],
      ['top', 'bottom'],
    ];
  }

  return [
    ['right', 'left'],
    ['left', 'right'],
    ['bottom', 'top'],
    ['top', 'bottom'],
  ];
}

function getNaturalSidePenalty(
  source: MindNode,
  target: MindNode,
  sourceSide: EdgeSide,
  targetSide: EdgeSide
) {
  const [preferredSourceSide, preferredTargetSide] = getPreferredSides(
    source,
    target
  );

  return (
    (sourceSide === preferredSourceSide ? 0 : HANDLE_DIRECTION_PENALTY) +
    (targetSide === preferredTargetSide ? 0 : HANDLE_DIRECTION_PENALTY)
  );
}

function getPreferredSides(
  source: MindNode,
  target: MindNode
): [EdgeSide, EdgeSide] {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }

  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function getSideDistance(
  source: MindNode,
  target: MindNode,
  sourceSide: EdgeSide,
  targetSide: EdgeSide
) {
  const sourcePoint = getNodeSidePoint(source, sourceSide);
  const targetPoint = getNodeSidePoint(target, targetSide);
  const isDirectionalMismatch =
    (sourceSide === 'right' && target.positionX < source.positionX) ||
    (sourceSide === 'left' && target.positionX > source.positionX) ||
    (sourceSide === 'bottom' && target.positionY < source.positionY) ||
    (sourceSide === 'top' && target.positionY > source.positionY);

  return (
    Math.abs(targetPoint.x - sourcePoint.x) +
    Math.abs(targetPoint.y - sourcePoint.y) +
    (isDirectionalMismatch ? 240 : 0)
  );
}

function getNodeCenter(node: MindNode) {
  const width = node.width || CARD_WIDTH;
  const height = node.height || CARD_HEIGHT;

  return {
    x: node.positionX + width / 2,
    y: node.positionY + height / 2,
  };
}

function getNodeSidePoint(node: MindNode, side: EdgeSide) {
  const width = node.width || CARD_WIDTH;
  const height = node.height || CARD_HEIGHT;
  const x = node.positionX;
  const y = node.positionY;

  if (side === 'top') return { x: x + width / 2, y };
  if (side === 'bottom') return { x: x + width / 2, y: y + height };
  if (side === 'left') return { x, y: y + height / 2 };
  return { x: x + width, y: y + height / 2 };
}

function getHandleUse(
  store: Map<string, Record<EdgeSide, number>>,
  nodeId: string,
  side: EdgeSide
) {
  return store.get(nodeId)?.[side] ?? 0;
}

function bumpHandleUse(
  store: Map<string, Record<EdgeSide, number>>,
  nodeId: string,
  side: EdgeSide
) {
  const entry =
    store.get(nodeId) ??
    ({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    } satisfies Record<EdgeSide, number>);
  entry[side] += 1;
  store.set(nodeId, entry);
}

function toEdgeObstacle(node: MindNode): MindEdgeObstacle {
  return {
    height: Math.max(node.height || 0, CARD_HEIGHT),
    id: node.id,
    width: Math.max(node.width || 0, CARD_WIDTH),
    x: node.positionX,
    y: node.positionY,
  };
}
