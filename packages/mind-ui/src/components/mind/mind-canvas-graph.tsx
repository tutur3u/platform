'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  Background,
  BaseEdge,
  type ColorMode,
  type Connection,
  ConnectionMode,
  Controls,
  type DefaultEdgeOptions,
  type EdgeChange,
  EdgeLabelRenderer,
  type EdgeMouseHandler,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
  type OnNodesChange,
  type OnNodesDelete,
  type OnSelectionChangeFunc,
  PanOnScrollMode,
  Position,
  ReactFlow,
  type SnapGrid,
} from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { memo, useCallback, useMemo, useState } from 'react';
import type {
  MindEdgeObstacle,
  MindFlowEdge,
  MindFlowNode,
  MindGroupFrame,
} from './mind-flow';
import {
  getMindConnectionHandleId,
  getMindEdgeFrameEndpoint,
} from './mind-flow';
import { MindNodeCard } from './mind-node-card';
import { useDebouncedValue } from './use-debounced-value';

type MindGroupFrameNodeData = Record<string, unknown> & {
  frame: MindGroupFrame;
};
type MindGroupFrameNode = Node<MindGroupFrameNodeData, 'mindGroupFrame'>;
type MindGraphNode = MindFlowNode | MindGroupFrameNode;

const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = { type: 'smoothstep' };
const SNAP_GRID: SnapGrid = [16, 16];
const AXIS_ALIGN_TOLERANCE = 8;
const DETOUR_GAPS = [72, 128, 196];
const FRAME_BORDER_LABEL_GAP = 18;
const FRAME_BORDER_LABEL_THICKNESS = 20;
const LABEL_ESTIMATED_CHAR_WIDTH = 7.6;
const LABEL_HEIGHT_COMPACT = 24;
const LABEL_OBSTACLE_PADDING = 12;
const LABEL_OFFSETS = [30, 52, 84, 120, 160] as const;
const LABEL_PADDING_X = 30;
const OBSTACLE_PADDING = 28;
const PORT_GAP = 36;
const RELATIONSHIP_LINE_LABEL_GAP = 28;
const ROUTING_OBSTACLE_DEBOUNCE_MS = 120;
const VERTICAL_LABEL_GAPS = [12, 24, 42, 72] as const;
const dimmedNodeCache = new WeakMap<MindFlowNode, MindFlowNode>();
const focusedEdgeCache = new WeakMap<
  MindFlowEdge,
  { dimmed?: MindFlowEdge; focused?: MindFlowEdge }
>();

type Props = {
  edges: MindFlowEdge[];
  groupFrames: MindGroupFrame[];
  nodes: MindFlowNode[];
  onConnect: (connection: Connection) => void;
  onCanvasClick?: () => void;
  onEdgesChange: (changes: EdgeChange<MindFlowEdge>[]) => void;
  onEdgesDelete: (edges: MindFlowEdge[]) => void;
  onNodesChange: (changes: NodeChange<MindFlowNode>[]) => void;
  onNodesDelete: (nodes: MindFlowNode[]) => void;
  onSelectEdgeLabel?: (edgeId: string) => void;
  selectedEdgeId?: string | null;
  selectedFrameId?: string | null;
  selectedNodeId?: string | null;
  onSelectionChange: (selection: {
    edges: MindFlowEdge[];
    frames: MindGroupFrame[];
    nodes: MindFlowNode[];
  }) => void;
};

export function MindCanvasGraph({
  edges,
  groupFrames,
  nodes,
  onConnect,
  onCanvasClick,
  onEdgesChange,
  onEdgesDelete,
  onNodesChange,
  onNodesDelete,
  onSelectEdgeLabel,
  selectedEdgeId,
  selectedFrameId,
  selectedNodeId,
  onSelectionChange,
}: Props) {
  const { resolvedTheme } = useTheme();
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const colorMode: ColorMode = resolvedTheme === 'light' ? 'light' : 'dark';
  const focusedEdgeId = hoveredEdgeId ?? selectedEdgeId;
  const focusedNodeId = hoveredNodeId ?? selectedNodeId;
  const routingNodes = useDebouncedValue(nodes, ROUTING_OBSTACLE_DEBOUNCE_MS);
  const routingEdges = useDebouncedValue(edges, ROUTING_OBSTACLE_DEBOUNCE_MS);
  const routingGroupFrames = useDebouncedValue(
    groupFrames,
    ROUTING_OBSTACLE_DEBOUNCE_MS
  );
  const frameById = useMemo(
    () => new Map(groupFrames.map((frame) => [frame.id, frame])),
    [groupFrames]
  );
  const frameNodes = useMemo(
    () =>
      groupFrames.map((frame) =>
        toMindGroupFrameNode(frame, frame.id === selectedFrameId)
      ),
    [groupFrames, selectedFrameId]
  );
  const edgesWithFrameLabelObstacles = useMemo<MindFlowEdge[]>(() => {
    const frameLabelObstacles = routingGroupFrames.flatMap(
      toFrameLabelObstacles
    );
    const nodeLabelObstacles = routingNodes.map(toFlowNodeObstacle);
    const relationshipLineObstacles = getRelationshipLineObstacles(
      routingEdges,
      routingNodes
    );
    const relationshipLabelObstacles = getRelationshipLabelObstacles(
      routingEdges,
      routingNodes
    );
    return edges.map((edge, edgeIndex) => {
      if (!edge.data) return edge;
      const otherRelationshipLineObstacles = relationshipLineObstacles.filter(
        (obstacle) => !obstacle.id.startsWith(`${edge.id}:`)
      );
      const otherRelationshipLabelObstacles = relationshipLabelObstacles.filter(
        (obstacle) => !obstacle.id.startsWith(`${edge.id}:`)
      );

      return {
        ...edge,
        data: {
          ...edge.data,
          labelLane: edgeIndex,
          onHoverEdge: setHoveredEdgeId,
          onSelectEdge: onSelectEdgeLabel,
          labelObstacles: [
            ...(edge.data.labelObstacles ?? []),
            ...nodeLabelObstacles,
            ...frameLabelObstacles,
            ...otherRelationshipLineObstacles,
            ...otherRelationshipLabelObstacles,
          ],
        },
      };
    });
  }, [
    edges,
    onSelectEdgeLabel,
    routingEdges,
    routingGroupFrames,
    routingNodes,
  ]);
  const graphEdges = useMemo(() => {
    const endpointEdges = applyFrameEndpointsToEdges({
      edges: edgesWithFrameLabelObstacles,
      frames: frameById,
      nodes,
    });

    return applyGraphFocusToEdges({
      edges: endpointEdges,
      focusedEdgeId,
      focusedNodeId,
    });
  }, [
    edgesWithFrameLabelObstacles,
    focusedEdgeId,
    focusedNodeId,
    frameById,
    nodes,
  ]);
  const graphNodes = useMemo<MindGraphNode[]>(
    () => [
      ...frameNodes,
      ...applyGraphFocusToNodes({
        edges: graphEdges,
        nodes,
        focusedEdgeId,
        focusedNodeId,
      }),
    ],
    [focusedEdgeId, focusedNodeId, frameNodes, graphEdges, nodes]
  );
  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler<MindFlowEdge>>(
    (_, edge) => setHoveredEdgeId(edge.id),
    []
  );
  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler<MindFlowEdge>>(
    () => setHoveredEdgeId(null),
    []
  );
  const handleNodeMouseEnter = useCallback<NodeMouseHandler<MindGraphNode>>(
    (_, node) => {
      if (isMindFlowNode(node)) setHoveredNodeId(node.id);
    },
    []
  );
  const handleNodeMouseLeave = useCallback<NodeMouseHandler<MindGraphNode>>(
    () => setHoveredNodeId(null),
    []
  );
  const handleNodesChange = useCallback<OnNodesChange<MindGraphNode>>(
    (changes) =>
      onNodesChange(
        changes.filter((change) => {
          if (!('id' in change)) return true;
          return !frameById.has(change.id);
        }) as NodeChange<MindFlowNode>[]
      ),
    [frameById, onNodesChange]
  );
  const handleNodesDelete = useCallback<OnNodesDelete<MindGraphNode>>(
    (deleted) => onNodesDelete(deleted.filter(isMindFlowNode)),
    [onNodesDelete]
  );
  const handleSelectionChange = useCallback<
    OnSelectionChangeFunc<MindGraphNode, MindFlowEdge>
  >(
    ({ edges: selectedEdges, nodes: selectedNodes }) =>
      onSelectionChange({
        edges: selectedEdges,
        frames: selectedNodes.filter(isMindGroupFrameNode).map((node) => {
          const data = node.data as MindGroupFrameNodeData;
          return data.frame;
        }),
        nodes: selectedNodes.filter(isMindFlowNode),
      }),
    [onSelectionChange]
  );

  return (
    <ReactFlow<MindGraphNode, MindFlowEdge>
      className="bg-root-background"
      colorMode={colorMode}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={42}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      edges={graphEdges}
      fitView
      nodes={graphNodes}
      edgeTypes={edgeTypes}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onPaneClick={onCanvasClick}
      onEdgesChange={onEdgesChange}
      onEdgesDelete={onEdgesDelete}
      onEdgeMouseEnter={handleEdgeMouseEnter}
      onEdgeMouseLeave={handleEdgeMouseLeave}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      onNodesChange={handleNodesChange}
      onNodesDelete={handleNodesDelete}
      onSelectionChange={handleSelectionChange}
      onlyRenderVisibleElements
      panOnScroll
      panOnScrollMode={PanOnScrollMode.Free}
      snapGrid={SNAP_GRID}
      snapToGrid
      zoomOnPinch
      zoomOnScroll={false}
    >
      <Background className="bg-root-background" />
      <Controls className="overflow-hidden rounded-md border border-border bg-background/95 shadow-lg [&_.react-flow__controls-button:hover]:bg-muted [&_.react-flow__controls-button]:border-border [&_.react-flow__controls-button]:bg-background [&_.react-flow__controls-button]:text-foreground [&_.react-flow__controls-button_svg]:fill-current" />
    </ReactFlow>
  );
}

function MindGroupFrameNode({ data, selected }: NodeProps) {
  const t = useTranslations('mind');
  const frame = (data as MindGroupFrameNodeData).frame;

  return (
    <div
      className={cn(
        'group/frame relative h-full w-full rounded-2xl border bg-background/5',
        selected &&
          'ring-2 ring-dynamic-blue ring-offset-2 ring-offset-root-background'
      )}
      style={{
        borderColor: frame.color,
        borderStyle: frame.kind === 'children' ? 'solid' : 'dashed',
        borderWidth: frame.kind === 'children' ? 1.5 : 1,
        boxShadow:
          frame.kind === 'children'
            ? `0 0 0 1px color-mix(in oklab, ${frame.color} 24%, transparent)`
            : undefined,
      }}
    >
      <MindFrameHandle position={Position.Top} />
      <MindFrameHandle position={Position.Right} />
      <MindFrameHandle position={Position.Bottom} />
      <MindFrameHandle position={Position.Left} />
      <div
        className="absolute -top-3 left-5 flex max-w-[calc(100%-2.5rem)] items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 font-medium text-[10px] uppercase tracking-[0.12em] shadow-lg"
        style={{ borderColor: frame.color, color: frame.color }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        <span className="truncate">
          {frame.kind === 'children'
            ? t('groups.childrenOf', {
                count: frame.childCount,
                parent: frame.parentTitle,
              })
            : t('groups.cluster', {
                count: frame.childCount,
                title: frame.title,
              })}
        </span>
      </div>
    </div>
  );
}

function MindFrameHandle({ position }: { position: Position }) {
  return (
    <Handle
      className="pointer-events-auto h-3 w-3 border-2 border-background bg-dynamic-blue opacity-75 transition group-hover/frame:opacity-100"
      id={getMindConnectionHandleId(positionToEdgeSide(position))}
      position={position}
      type="source"
    />
  );
}

function toMindGroupFrameNode(
  frame: MindGroupFrame,
  selected: boolean
): MindGroupFrameNode {
  return {
    className: 'pointer-events-auto',
    connectable: true,
    data: { frame },
    deletable: false,
    draggable: false,
    focusable: true,
    id: frame.id,
    position: { x: frame.x, y: frame.y },
    selectable: true,
    selected,
    style: {
      height: frame.height,
      width: frame.width,
    },
    type: 'mindGroupFrame',
    zIndex: 0,
  };
}

function applyFrameEndpointsToEdges({
  edges,
  frames,
  nodes,
}: {
  edges: MindFlowEdge[];
  frames: Map<string, MindGroupFrame>;
  nodes: MindFlowNode[];
}) {
  if (frames.size === 0) return edges;

  const rectById = new Map<string, RectLike>();
  for (const node of nodes) {
    rectById.set(node.id, {
      height: Math.max(node.data.node.height || 0, node.height || 0, 168),
      width: Math.max(node.data.node.width || 0, node.width || 0, 280),
      x: node.position.x,
      y: node.position.y,
    });
  }
  for (const frame of frames.values()) {
    rectById.set(frame.id, frame);
  }

  return edges.map((edge) => {
    const rawEdge = edge.data?.edge;
    if (!rawEdge) return edge;

    const sourceFrameId = getMindEdgeFrameEndpoint(rawEdge, 'source');
    const targetFrameId = getMindEdgeFrameEndpoint(rawEdge, 'target');
    const sourceFrame = sourceFrameId ? frames.get(sourceFrameId) : undefined;
    const targetFrame = targetFrameId ? frames.get(targetFrameId) : undefined;
    if (!sourceFrame && !targetFrame) return edge;

    const source = sourceFrame?.id ?? edge.source;
    const target = targetFrame?.id ?? edge.target;
    const sourceRect = rectById.get(source);
    const targetRect = rectById.get(target);

    return {
      ...edge,
      source,
      sourceHandle:
        sourceFrame && sourceRect && targetRect
          ? getMindConnectionHandleId(getSideFacing(sourceRect, targetRect))
          : edge.sourceHandle,
      target,
      targetHandle:
        targetFrame && sourceRect && targetRect
          ? getMindConnectionHandleId(getSideFacing(targetRect, sourceRect))
          : edge.targetHandle,
    };
  });
}

function applyGraphFocusToEdges({
  edges,
  focusedEdgeId,
  focusedNodeId,
}: {
  edges: MindFlowEdge[];
  focusedEdgeId?: string | null;
  focusedNodeId?: string | null;
}) {
  if (!focusedEdgeId && !focusedNodeId) return edges;

  return edges.map((edge): MindFlowEdge => {
    const focused =
      edge.id === focusedEdgeId ||
      edge.source === focusedNodeId ||
      edge.target === focusedNodeId;
    return getFocusedEdge(edge, focused);
  });
}

function applyGraphFocusToNodes({
  edges,
  nodes,
  focusedEdgeId,
  focusedNodeId,
}: {
  edges: MindFlowEdge[];
  nodes: MindFlowNode[];
  focusedEdgeId?: string | null;
  focusedNodeId?: string | null;
}) {
  if (!focusedEdgeId && !focusedNodeId) return nodes;

  const focusedNodeIds = new Set<string>();
  if (focusedNodeId) focusedNodeIds.add(focusedNodeId);
  for (const edge of edges) {
    if (edge.id === focusedEdgeId) {
      focusedNodeIds.add(edge.source);
      focusedNodeIds.add(edge.target);
      continue;
    }
    if (
      focusedNodeId &&
      (edge.source === focusedNodeId || edge.target === focusedNodeId)
    ) {
      focusedNodeIds.add(edge.source);
      focusedNodeIds.add(edge.target);
    }
  }

  return nodes.map((node) => getFocusedNode(node, focusedNodeIds.has(node.id)));
}

function getFocusedEdge(edge: MindFlowEdge, focused: boolean) {
  if (!edge.data) return edge;

  const dimmed = !focused;
  if (edge.data.dimmed === dimmed && edge.data.focused === focused) {
    return edge;
  }

  const cacheKey = focused ? 'focused' : 'dimmed';
  const cached = focusedEdgeCache.get(edge)?.[cacheKey];
  if (cached) return cached;

  const next = {
    ...edge,
    data: {
      ...edge.data,
      dimmed,
      focused,
    },
  };
  const cache = focusedEdgeCache.get(edge) ?? {};
  cache[cacheKey] = next;
  focusedEdgeCache.set(edge, cache);

  return next;
}

function getFocusedNode(node: MindFlowNode, focused: boolean) {
  if (focused) {
    if (node.data.dimmed !== true) return node;

    return {
      ...node,
      data: {
        ...node.data,
        dimmed: false,
      },
    };
  }

  if (node.data.dimmed === true) return node;

  const cached = dimmedNodeCache.get(node);
  if (cached) return cached;

  const next = {
    ...node,
    data: {
      ...node.data,
      dimmed: true,
    },
  };
  dimmedNodeCache.set(node, next);

  return next;
}

function isMindFlowNode(node: MindGraphNode): node is MindFlowNode {
  return node.type === 'mindNode';
}

function isMindGroupFrameNode(node: MindGraphNode): node is MindGroupFrameNode {
  return node.type === 'mindGroupFrame';
}

type EdgeSide = 'bottom' | 'left' | 'right' | 'top';
type RectLike = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function positionToEdgeSide(position: Position): EdgeSide {
  if (position === Position.Top) return 'top';
  if (position === Position.Bottom) return 'bottom';
  if (position === Position.Left) return 'left';
  return 'right';
}

function getSideFacing(from: RectLike, to: RectLike): EdgeSide {
  const fromCenter = getRectCenter(from);
  const toCenter = getRectCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }

  return dy >= 0 ? 'bottom' : 'top';
}

function getRectCenter(rect: RectLike) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function MindRelationshipEdge({
  data,
  id,
  interactionWidth,
  label,
  markerEnd,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<MindFlowEdge>) {
  const sourceSide = sourcePosition ?? Position.Right;
  const targetSide = targetPosition ?? Position.Left;
  const relationshipLabel =
    typeof label === 'string' && label.trim()
      ? label.trim()
      : data?.edge.edgeType.replaceAll('_', ' ');
  const edgeStroke = typeof style?.stroke === 'string' ? style.stroke : null;
  const dimmed = data?.dimmed === true && !selected;
  const focused = data?.focused === true || selected;
  const route = useMemo(
    () =>
      buildRelationshipRoute({
        fallbackPositions: {
          source: sourceSide,
          target: targetSide,
        },
        labelLane: data?.labelLane,
        labelObstacles: data?.labelObstacles ?? [],
        labelText: relationshipLabel,
        obstacles: data?.obstacles ?? [],
        source: { x: sourceX, y: sourceY },
        target: { x: targetX, y: targetY },
      }),
    [
      data?.labelLane,
      data?.labelObstacles,
      data?.obstacles,
      relationshipLabel,
      sourceSide,
      sourceX,
      sourceY,
      targetSide,
      targetX,
      targetY,
    ]
  );
  const labelMaxWidth = Math.min(route.label.maxWidth, 220);

  return (
    <>
      <BaseEdge
        id={id}
        interactionWidth={interactionWidth ?? 28}
        markerEnd={markerEnd}
        path={route.path}
        style={{
          ...style,
          strokeWidth: focused ? 3 : style?.strokeWidth,
          strokeOpacity: dimmed ? 0.18 : style?.strokeOpacity,
        }}
      />
      {label && route.label.visible !== false ? (
        <EdgeLabelRenderer>
          <EdgeLabelConnector
            label={route.label}
            selected={focused}
            stroke={edgeStroke}
          />
          <button
            className={cn(
              'nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border border-dynamic-blue/45 bg-background/95 px-2 py-0.5 text-left font-medium text-[11px] shadow-sm backdrop-blur transition hover:bg-muted'
            )}
            onClick={(event) => {
              event.stopPropagation();
              data?.onSelectEdge?.(id);
            }}
            onPointerEnter={() => data?.onHoverEdge?.(id)}
            onPointerLeave={() => data?.onHoverEdge?.(null)}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              borderColor: edgeStroke ?? undefined,
              left: route.label.x,
              maxWidth: labelMaxWidth,
              opacity: dimmed ? 0.35 : undefined,
              top: route.label.y,
              zIndex: focused ? 50 : 30,
            }}
            title={relationshipLabel}
            type="button"
          >
            <span className="block min-w-0 truncate whitespace-nowrap leading-4">
              {relationshipLabel}
            </span>
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function EdgeLabelConnector({
  label,
  selected,
  stroke,
}: {
  label: LabelPlacement;
  selected?: boolean;
  stroke: string | null;
}) {
  const deltaX = label.x - label.anchorX;
  const deltaY = label.y - label.anchorY;
  if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) return null;

  const left = Math.min(label.x, label.anchorX);
  const top = Math.min(label.y, label.anchorY);
  const width = Math.max(1, Math.abs(deltaX));
  const height = Math.max(1, Math.abs(deltaY));

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible text-dynamic-blue"
      style={{
        height,
        left,
        top,
        width,
        zIndex: selected ? 49 : 29,
      }}
    >
      <line
        stroke={stroke ?? 'currentColor'}
        strokeDasharray="3 3"
        strokeLinecap="round"
        strokeOpacity={selected ? 0.9 : 0.65}
        strokeWidth={1.5}
        x1={label.anchorX - left}
        x2={label.x - left}
        y1={label.anchorY - top}
        y2={label.y - top}
      />
    </svg>
  );
}

const MemoizedMindGroupFrameNode = memo(MindGroupFrameNode);
MemoizedMindGroupFrameNode.displayName = 'MindGroupFrameNode';

const MemoizedMindRelationshipEdge = memo(MindRelationshipEdge);
MemoizedMindRelationshipEdge.displayName = 'MindRelationshipEdge';

const nodeTypes = {
  mindGroupFrame: MemoizedMindGroupFrameNode,
  mindNode: MindNodeCard,
};
const edgeTypes = { mindRelationship: MemoizedMindRelationshipEdge };

type Point = { x: number; y: number };
type LabelPlacement = {
  anchorX: number;
  anchorY: number;
  maxWidth: number;
  oneLine: boolean;
  visible?: boolean;
  x: number;
  y: number;
};
type LabelCandidate = LabelPlacement & {
  horizontal: boolean;
  lineGap: number;
  offsetRank: number;
  segmentLength: number;
  side: -1 | 0 | 1;
};
type Rect = { height: number; width: number; x: number; y: number };

export function buildRelationshipRoute({
  fallbackPositions,
  labelLane = 0,
  labelObstacles = [],
  labelText,
  obstacles,
  source,
  target,
}: {
  fallbackPositions: { source: Position; target: Position };
  labelLane?: number;
  labelObstacles?: MindEdgeObstacle[];
  labelText?: string;
  obstacles: MindEdgeObstacle[];
  source: Point;
  target: Point;
}) {
  const safeObstacles = obstacles.map((obstacle) => expandObstacle(obstacle));
  const safeLabelObstacles = (
    labelObstacles.length > 0 ? labelObstacles : obstacles
  ).map((obstacle) => expandLabelObstacle(obstacle));
  const candidates: Point[][] = [];
  const direct = [source, target];

  if (isAxisAligned(source, target) && isPathClear(direct, safeObstacles)) {
    return createRoute(direct, {
      labelLane,
      labelObstacles: safeLabelObstacles,
      labelText,
    });
  }

  const sourceOut = getPortPoint(source, fallbackPositions.source);
  const targetOut = getPortPoint(target, fallbackPositions.target);
  const midX = (sourceOut.x + targetOut.x) / 2;
  const midY = (sourceOut.y + targetOut.y) / 2;

  candidates.push(
    [source, { x: target.x, y: source.y }, target],
    [source, { x: source.x, y: target.y }, target],
    [source, sourceOut, { x: targetOut.x, y: sourceOut.y }, targetOut, target],
    [source, sourceOut, { x: sourceOut.x, y: targetOut.y }, targetOut, target],
    [
      source,
      sourceOut,
      { x: midX, y: sourceOut.y },
      { x: midX, y: targetOut.y },
      targetOut,
      target,
    ],
    [
      source,
      sourceOut,
      { x: sourceOut.x, y: midY },
      { x: targetOut.x, y: midY },
      targetOut,
      target,
    ]
  );

  const bounds = getRouteBounds(source, target, safeObstacles);
  for (const gap of DETOUR_GAPS) {
    const topY = bounds.minY - gap;
    const bottomY = bounds.maxY + gap;
    const leftX = bounds.minX - gap;
    const rightX = bounds.maxX + gap;

    candidates.push(
      [
        source,
        sourceOut,
        { x: sourceOut.x, y: topY },
        { x: targetOut.x, y: topY },
        targetOut,
        target,
      ],
      [
        source,
        sourceOut,
        { x: sourceOut.x, y: bottomY },
        { x: targetOut.x, y: bottomY },
        targetOut,
        target,
      ],
      [
        source,
        sourceOut,
        { x: leftX, y: sourceOut.y },
        { x: leftX, y: targetOut.y },
        targetOut,
        target,
      ],
      [
        source,
        sourceOut,
        { x: rightX, y: sourceOut.y },
        { x: rightX, y: targetOut.y },
        targetOut,
        target,
      ]
    );
  }

  const clearRoute = candidates
    .map(compactPoints)
    .filter((candidate) => isPathClear(candidate, safeObstacles))
    .sort((a, b) => getRouteScore(a) - getRouteScore(b))[0];

  if (clearRoute) {
    return createRoute(clearRoute, {
      labelLane,
      labelObstacles: safeLabelObstacles,
      labelText,
    });
  }

  const [fallbackPath, labelX, labelY] = getSmoothStepPath({
    borderRadius: 0,
    offset: 32,
    sourcePosition: fallbackPositions.source,
    sourceX: source.x,
    sourceY: source.y,
    targetPosition: fallbackPositions.target,
    targetX: target.x,
    targetY: target.y,
  });

  return {
    label: pickBestLabelCandidate(
      [
        {
          horizontal: false,
          anchorX: labelX,
          anchorY: labelY,
          lineGap: 0,
          maxWidth: 220,
          oneLine: false,
          offsetRank: 0,
          side: 0,
          segmentLength: 0,
          x: labelX,
          y: labelY,
        },
      ],
      {
        labelLane,
        labelObstacles: safeLabelObstacles,
        labelText,
        routeMidpoint: { x: labelX, y: labelY },
      }
    ),
    path: fallbackPath,
    points: [source, target],
  };
}

function createRoute(
  points: Point[],
  options?: {
    labelLane?: number;
    labelObstacles?: MindEdgeObstacle[];
    labelText?: string;
  }
) {
  const compacted = compactPoints(points);
  const path = compacted
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const midpoint = getPathLabel(compacted, options);

  return { label: midpoint, path, points: compacted };
}

function compactPoints(points: Point[]) {
  return points
    .filter((point, index) => {
      const previous = points[index - 1];
      return !previous || previous.x !== point.x || previous.y !== point.y;
    })
    .filter((point, index, compacted) => {
      const previous = compacted[index - 1];
      const next = compacted[index + 1];
      if (!previous || !next) return true;
      const sameHorizontal = previous.y === point.y && point.y === next.y;
      const sameVertical = previous.x === point.x && point.x === next.x;
      return !(sameHorizontal || sameVertical);
    });
}

function getPathLabel(
  points: Point[],
  {
    labelLane = 0,
    labelObstacles = [],
    labelText,
  }: {
    labelLane?: number;
    labelObstacles?: MindEdgeObstacle[];
    labelText?: string;
  } = {}
) {
  const total = getPathLength(points);
  const pathMidpoint = getPointAtPathLength(points, total / 2);
  const relationMidpoint = getRelationMidpoint(points) ?? pathMidpoint;
  const candidates = [
    ...getDetachedRelationLabelCandidates({
      labelText,
      relationMidpoint,
      routeAnchor: pathMidpoint,
    }),
    ...getSegments(points).flatMap((segment) =>
      getSegmentLabelCandidates(segment, labelText)
    ),
  ];

  if (candidates.length > 0) {
    return pickBestLabelCandidate(candidates, {
      labelLane,
      labelObstacles,
      labelText,
      routeMidpoint: relationMidpoint,
    });
  }

  const fallback = points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
  return {
    anchorX: fallback.x,
    anchorY: fallback.y,
    maxWidth: 180,
    oneLine: false,
    ...fallback,
  };
}

function getRelationMidpoint(points: Point[]) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  return {
    x: (first.x + last.x) / 2,
    y: (first.y + last.y) / 2,
  };
}

function getDetachedRelationLabelCandidates({
  labelText,
  relationMidpoint,
  routeAnchor,
}: {
  labelText?: string;
  relationMidpoint: Point;
  routeAnchor: Point;
}): LabelCandidate[] {
  const routeDistance =
    Math.abs(routeAnchor.x - relationMidpoint.x) +
    Math.abs(routeAnchor.y - relationMidpoint.y);
  if (routeDistance < 96) return [];

  const maxWidth = Math.min(
    220,
    Math.max(120, getDesiredLabelWidth(labelText))
  );
  const base = {
    anchorX: routeAnchor.x,
    anchorY: routeAnchor.y,
    horizontal: true,
    maxWidth,
    oneLine: true,
    segmentLength: 0,
  };

  return [
    {
      ...base,
      lineGap: 0,
      offsetRank: 0,
      side: 0 as const,
      x: relationMidpoint.x,
      y: relationMidpoint.y,
    },
    ...LABEL_OFFSETS.flatMap((offset, offsetIndex) => [
      {
        ...base,
        lineGap: 0,
        offsetRank: offsetIndex + 1,
        side: -1 as const,
        x: relationMidpoint.x,
        y: relationMidpoint.y - offset,
      },
      {
        ...base,
        lineGap: 0,
        offsetRank: offsetIndex + 1,
        side: 1 as const,
        x: relationMidpoint.x,
        y: relationMidpoint.y + offset,
      },
    ]),
  ];
}

function getSegmentLabelCandidates(
  segment: { end: Point; length: number; start: Point },
  labelText?: string
): LabelCandidate[] {
  if (segment.length < 48) return [];

  const horizontal = segment.start.y === segment.end.y;
  const desiredWidth = getDesiredLabelWidth(labelText);
  const maxWidth = horizontal
    ? Math.min(220, Math.max(112, segment.length - 32))
    : Math.min(220, Math.max(120, desiredWidth));
  const oneLine = true;
  const base = { horizontal, maxWidth, oneLine, segmentLength: segment.length };
  const ratios = segment.length >= 180 ? [0.22, 0.36, 0.5, 0.64, 0.78] : [0.5];

  if (horizontal) {
    return ratios.flatMap((ratio) => {
      const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
      const anchor = { anchorX: x, anchorY: segment.start.y };
      return [
        {
          ...base,
          ...anchor,
          lineGap: 0,
          offsetRank: 0,
          side: 0 as const,
          x,
          y: segment.start.y,
        },
        ...LABEL_OFFSETS.flatMap((offset, offsetIndex) => [
          {
            ...base,
            ...anchor,
            lineGap: offset - LABEL_HEIGHT_COMPACT / 2,
            offsetRank: offsetIndex + 1,
            side: -1 as const,
            x,
            y: segment.start.y - offset,
          },
          {
            ...base,
            ...anchor,
            lineGap: offset - LABEL_HEIGHT_COMPACT / 2,
            offsetRank: offsetIndex + 1,
            side: 1 as const,
            x,
            y: segment.start.y + offset,
          },
        ]),
      ];
    });
  }

  return ratios.flatMap((ratio) => {
    const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
    const labelWidth = estimateLabelWidth(labelText, maxWidth);
    const anchor = { anchorX: segment.start.x, anchorY: y };
    return [
      {
        ...base,
        ...anchor,
        lineGap: 0,
        offsetRank: 0,
        side: 0 as const,
        x: segment.start.x,
        y,
      },
      ...VERTICAL_LABEL_GAPS.flatMap((gap, offsetIndex) => [
        {
          ...base,
          ...anchor,
          lineGap: gap,
          offsetRank: offsetIndex + 1,
          side: 1 as const,
          x: segment.start.x + labelWidth / 2 + gap,
          y,
        },
        {
          ...base,
          ...anchor,
          lineGap: gap,
          offsetRank: offsetIndex + 1,
          side: -1 as const,
          x: segment.start.x - labelWidth / 2 - gap,
          y,
        },
      ]),
    ];
  });
}

function pickBestLabelCandidate(
  candidates: LabelCandidate[],
  {
    labelLane = 0,
    labelObstacles,
    labelText,
    routeMidpoint,
  }: {
    labelLane?: number;
    labelObstacles: MindEdgeObstacle[];
    labelText?: string;
    routeMidpoint: Point;
  }
): LabelPlacement {
  const safeCandidates = candidates.filter(
    (candidate) =>
      getLabelCollisionArea(
        getLabelRect(candidate, labelText),
        labelObstacles
      ) === 0
  );
  const eligibleCandidates = safeCandidates.length ? safeCandidates : [];
  const best = [...eligibleCandidates].sort(
    (a, b) =>
      getLabelScore(a, labelText, labelObstacles, routeMidpoint, labelLane) -
      getLabelScore(b, labelText, labelObstacles, routeMidpoint, labelLane)
  )[0];

  if (!best) {
    return {
      anchorX: routeMidpoint.x,
      anchorY: routeMidpoint.y,
      maxWidth: 180,
      oneLine: false,
      visible: false,
      x: routeMidpoint.x,
      y: routeMidpoint.y,
    };
  }

  const {
    horizontal: _horizontal,
    lineGap: _lineGap,
    offsetRank: _offsetRank,
    segmentLength: _segmentLength,
    side: _side,
    ...label
  } = best;
  return { ...label, visible: true };
}

function getLabelScore(
  candidate: LabelCandidate,
  labelText: string | undefined,
  obstacles: MindEdgeObstacle[],
  routeMidpoint: Point,
  labelLane: number
) {
  const rect = getLabelRect(candidate, labelText);
  const collisionPenalty = getLabelCollisionArea(rect, obstacles);
  const distanceFromMidpoint =
    Math.abs(candidate.x - routeMidpoint.x) +
    Math.abs(candidate.y - routeMidpoint.y);
  const estimatedWidth = estimateLabelWidth(labelText, candidate.maxWidth);
  const fitPenalty = estimatedWidth > candidate.maxWidth ? 300 : 0;
  const preferredSide = labelLane % 2 === 0 ? -1 : 1;
  const preferredOffsetRank = Math.floor(labelLane / 2) % 3;
  const sidePenalty =
    candidate.side === 0 ? 45 : candidate.side === preferredSide ? 0 : 90;
  const offsetPenalty =
    candidate.side === 0
      ? 0
      : Math.abs(candidate.offsetRank - (preferredOffsetRank + 1)) * 18;

  return (
    collisionPenalty +
    fitPenalty +
    sidePenalty +
    offsetPenalty +
    distanceFromMidpoint * 0.75 +
    candidate.lineGap * 5 +
    (candidate.horizontal ? 0 : 70) +
    (candidate.oneLine ? -60 : 20) -
    candidate.segmentLength * 0.05
  );
}

function getLabelRect(label: LabelPlacement, labelText?: string): Rect {
  const width = estimateLabelWidth(labelText, Math.min(label.maxWidth, 220));
  const height = LABEL_HEIGHT_COMPACT;

  return {
    height,
    width,
    x: label.x - width / 2,
    y: label.y - height / 2,
  };
}

function estimateLabelWidth(labelText: string | undefined, maxWidth: number) {
  return Math.min(maxWidth, Math.max(72, getDesiredLabelWidth(labelText)));
}

function getDesiredLabelWidth(labelText: string | undefined) {
  return (
    (labelText?.length ?? 12) * LABEL_ESTIMATED_CHAR_WIDTH + LABEL_PADDING_X
  );
}

function getPointAtPathLength(points: Point[], targetLength: number) {
  let cursor = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;

    const segmentLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (cursor + segmentLength >= targetLength) {
      const ratio =
        segmentLength === 0 ? 0 : (targetLength - cursor) / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }

    cursor += segmentLength;
  }

  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

function isPathClear(points: Point[], obstacles: MindEdgeObstacle[]) {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    if (
      obstacles.some((obstacle) => segmentIntersectsRect(start, end, obstacle))
    ) {
      return false;
    }
  }

  return true;
}

function getPathLength(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    if (!previous) return sum;
    return (
      sum + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    );
  }, 0);
}

function getRouteScore(points: Point[]) {
  return getPathLength(points) + getBendCount(points) * 36;
}

function getBendCount(points: Point[]) {
  let bends = 0;
  for (let index = 2; index < points.length; index += 1) {
    const previous = points[index - 2];
    const current = points[index - 1];
    const next = points[index];
    if (!previous || !current || !next) continue;
    const previousHorizontal = previous.y === current.y;
    const nextHorizontal = current.y === next.y;
    if (previousHorizontal !== nextHorizontal) bends += 1;
  }
  return bends;
}

function getSegments(points: Point[]) {
  return points.flatMap((point, index) => {
    const previous = points[index - 1];
    if (!previous) return [];
    return [
      {
        end: point,
        length: Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y),
        start: previous,
      },
    ];
  });
}

function isAxisAligned(source: Point, target: Point) {
  return (
    Math.abs(source.x - target.x) <= AXIS_ALIGN_TOLERANCE ||
    Math.abs(source.y - target.y) <= AXIS_ALIGN_TOLERANCE
  );
}

function getPortPoint(point: Point, side: Position) {
  if (side === Position.Top) return { x: point.x, y: point.y - PORT_GAP };
  if (side === Position.Bottom) return { x: point.x, y: point.y + PORT_GAP };
  if (side === Position.Left) return { x: point.x - PORT_GAP, y: point.y };
  return { x: point.x + PORT_GAP, y: point.y };
}

function expandObstacle(obstacle: MindEdgeObstacle): MindEdgeObstacle {
  return {
    ...obstacle,
    height: obstacle.height + OBSTACLE_PADDING * 2,
    width: obstacle.width + OBSTACLE_PADDING * 2,
    x: obstacle.x - OBSTACLE_PADDING,
    y: obstacle.y - OBSTACLE_PADDING,
  };
}

function expandLabelObstacle(obstacle: MindEdgeObstacle): MindEdgeObstacle {
  return {
    ...obstacle,
    height: obstacle.height + LABEL_OBSTACLE_PADDING * 2,
    width: obstacle.width + LABEL_OBSTACLE_PADDING * 2,
    x: obstacle.x - LABEL_OBSTACLE_PADDING,
    y: obstacle.y - LABEL_OBSTACLE_PADDING,
  };
}

function toFrameLabelObstacles(frame: MindGroupFrame): MindEdgeObstacle[] {
  const strip = FRAME_BORDER_LABEL_THICKNESS;
  const halfStrip = strip / 2;

  return [
    {
      height: strip,
      id: `${frame.id}:top-border`,
      width: frame.width,
      x: frame.x,
      y: frame.y - halfStrip,
    },
    {
      height: strip,
      id: `${frame.id}:bottom-border`,
      width: frame.width,
      x: frame.x,
      y: frame.y + frame.height - halfStrip,
    },
    {
      height: frame.height,
      id: `${frame.id}:left-border`,
      width: strip,
      x: frame.x - halfStrip,
      y: frame.y,
    },
    {
      height: frame.height,
      id: `${frame.id}:right-border`,
      width: strip,
      x: frame.x + frame.width - halfStrip,
      y: frame.y,
    },
    {
      height: 36,
      id: `${frame.id}:title`,
      width: Math.min(frame.width - FRAME_BORDER_LABEL_GAP * 2, 380),
      x: frame.x + FRAME_BORDER_LABEL_GAP,
      y: frame.y - 24,
    },
  ];
}

function getRelationshipLineObstacles(
  edges: MindFlowEdge[],
  nodes: MindFlowNode[]
): MindEdgeObstacle[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeObstacles = nodes.map(toFlowNodeObstacle);

  return edges.flatMap((edge, edgeIndex) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const sourcePosition = getPositionFromHandle(
      edge.sourceHandle,
      Position.Right
    );
    const targetPosition = getPositionFromHandle(
      edge.targetHandle,
      Position.Left
    );
    const route = buildRelationshipRoute({
      fallbackPositions: {
        source: sourcePosition,
        target: targetPosition,
      },
      labelLane: edgeIndex,
      obstacles: nodeObstacles.filter(
        (obstacle) => obstacle.id !== edge.source && obstacle.id !== edge.target
      ),
      source: getFlowNodeSidePoint(sourceNode, sourcePosition),
      target: getFlowNodeSidePoint(targetNode, targetPosition),
    });

    return getSegments(route.points).flatMap((segment, index) =>
      toRelationshipLineObstacle(edge.id, index, segment)
    );
  });
}

function getRelationshipLabelObstacles(
  edges: MindFlowEdge[],
  nodes: MindFlowNode[]
): MindEdgeObstacle[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeObstacles = nodes.map(toFlowNodeObstacle);

  return edges.flatMap((edge, edgeIndex) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const labelText = getFlowEdgeLabel(edge);
    if (!sourceNode || !targetNode || !labelText) return [];

    const sourcePosition = getPositionFromHandle(
      edge.sourceHandle,
      Position.Right
    );
    const targetPosition = getPositionFromHandle(
      edge.targetHandle,
      Position.Left
    );
    const route = buildRelationshipRoute({
      fallbackPositions: {
        source: sourcePosition,
        target: targetPosition,
      },
      labelLane: edgeIndex,
      labelText,
      obstacles: nodeObstacles.filter(
        (obstacle) => obstacle.id !== edge.source && obstacle.id !== edge.target
      ),
      source: getFlowNodeSidePoint(sourceNode, sourcePosition),
      target: getFlowNodeSidePoint(targetNode, targetPosition),
    });

    if (route.label.visible === false) return [];
    return toRelationshipLabelObstacle(edge.id, route.label, labelText);
  });
}

function getFlowEdgeLabel(edge: MindFlowEdge) {
  if (typeof edge.label === 'string' && edge.label.trim()) {
    return edge.label.trim();
  }

  const dataLabel = edge.data?.edge.label;
  return typeof dataLabel === 'string' && dataLabel.trim()
    ? dataLabel.trim()
    : null;
}

function getPositionFromHandle(
  handle: string | null | undefined,
  fallback: Position
) {
  if (handle?.endsWith('top')) return Position.Top;
  if (handle?.endsWith('bottom')) return Position.Bottom;
  if (handle?.endsWith('left')) return Position.Left;
  if (handle?.endsWith('right')) return Position.Right;
  return fallback;
}

function getFlowNodeSidePoint(node: MindFlowNode, side: Position): Point {
  const obstacle = toFlowNodeObstacle(node);
  if (side === Position.Top) {
    return { x: obstacle.x + obstacle.width / 2, y: obstacle.y };
  }
  if (side === Position.Bottom) {
    return {
      x: obstacle.x + obstacle.width / 2,
      y: obstacle.y + obstacle.height,
    };
  }
  if (side === Position.Left) {
    return { x: obstacle.x, y: obstacle.y + obstacle.height / 2 };
  }
  return {
    x: obstacle.x + obstacle.width,
    y: obstacle.y + obstacle.height / 2,
  };
}

function toFlowNodeObstacle(node: MindFlowNode): MindEdgeObstacle {
  const mindNode = node.data.node;
  return {
    height: Math.max(mindNode.height || 0, node.height || 0, 168),
    id: node.id,
    width: Math.max(mindNode.width || 0, node.width || 0, 280),
    x: node.position.x,
    y: node.position.y,
  };
}

function toRelationshipLineObstacle(
  edgeId: string,
  index: number,
  segment: { end: Point; length: number; start: Point }
): MindEdgeObstacle[] {
  if (segment.length < 8) return [];

  const padding = RELATIONSHIP_LINE_LABEL_GAP / 2;
  if (segment.start.y === segment.end.y) {
    return [
      {
        height: RELATIONSHIP_LINE_LABEL_GAP,
        id: `${edgeId}:line-${index}`,
        width: Math.abs(segment.end.x - segment.start.x),
        x: Math.min(segment.start.x, segment.end.x),
        y: segment.start.y - padding,
      },
    ];
  }

  if (segment.start.x === segment.end.x) {
    return [
      {
        height: Math.abs(segment.end.y - segment.start.y),
        id: `${edgeId}:line-${index}`,
        width: RELATIONSHIP_LINE_LABEL_GAP,
        x: segment.start.x - padding,
        y: Math.min(segment.start.y, segment.end.y),
      },
    ];
  }

  return [
    {
      height:
        Math.abs(segment.end.y - segment.start.y) + RELATIONSHIP_LINE_LABEL_GAP,
      id: `${edgeId}:line-${index}`,
      width:
        Math.abs(segment.end.x - segment.start.x) + RELATIONSHIP_LINE_LABEL_GAP,
      x: Math.min(segment.start.x, segment.end.x) - padding,
      y: Math.min(segment.start.y, segment.end.y) - padding,
    },
  ];
}

function toRelationshipLabelObstacle(
  edgeId: string,
  label: LabelPlacement,
  labelText: string
): MindEdgeObstacle[] {
  const rect = getLabelRect(label, labelText);
  const padding = LABEL_OBSTACLE_PADDING / 2;

  return [
    {
      height: rect.height + padding * 2,
      id: `${edgeId}:label`,
      width: rect.width + padding * 2,
      x: rect.x - padding,
      y: rect.y - padding,
    },
  ];
}

function getRouteBounds(
  source: Point,
  target: Point,
  obstacles: MindEdgeObstacle[]
) {
  return {
    maxX: Math.max(
      target.x,
      source.x,
      ...obstacles.map((item) => item.x + item.width)
    ),
    maxY: Math.max(
      target.y,
      source.y,
      ...obstacles.map((item) => item.y + item.height)
    ),
    minX: Math.min(target.x, source.x, ...obstacles.map((item) => item.x)),
    minY: Math.min(target.y, source.y, ...obstacles.map((item) => item.y)),
  };
}

function segmentIntersectsRect(
  start: Point,
  end: Point,
  rect: MindEdgeObstacle
) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  if (
    Math.max(start.x, end.x) < rect.x ||
    Math.min(start.x, end.x) > rect.x + rect.width ||
    Math.max(start.y, end.y) < rect.y ||
    Math.min(start.y, end.y) > rect.y + rect.height
  ) {
    return false;
  }

  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function pointInRect(point: Point, rect: MindEdgeObstacle) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getRectIntersectionArea(a: Rect, b: Rect) {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  );

  return xOverlap * yOverlap;
}

function getLabelCollisionArea(rect: Rect, obstacles: MindEdgeObstacle[]) {
  return obstacles.reduce(
    (sum, obstacle) =>
      sum +
      getRectIntersectionArea(rect, obstacle) *
        (obstacle.id.includes(':line-') ? 500 : 1000),
    0
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const orientationA = orientation(a, b, c);
  const orientationB = orientation(a, b, d);
  const orientationC = orientation(c, d, a);
  const orientationD = orientation(c, d, b);

  return orientationA * orientationB <= 0 && orientationC * orientationD <= 0;
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}
