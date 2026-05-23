import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  formatMindBoardAsJson,
  formatMindBoardAsMarkdown,
} from './mind-board-export';
import { buildRelationshipRoute } from './mind-canvas-graph';
import {
  createMindConnectionEdge,
  getMindGroupFrames,
  organizeMindLayout,
  toFlowEdges,
  toFlowEdgesWithNodes,
  toFlowNodes,
} from './mind-flow';
import { resolveMindRenderUiSpec } from './mind-json-render-spec';

const now = '2026-05-20T00:00:00.000Z';

describe('Mind canvas graph utilities', () => {
  it('organizes sequence roots, parent children, and support roots into readable lanes', () => {
    const nodes = [
      node({ id: 'phase-1', nodeType: 'milestone', title: 'Phase 1' }),
      node({ id: 'phase-2', nodeType: 'milestone', title: 'Phase 2' }),
      node({ id: 'phase-3', nodeType: 'milestone', title: 'Phase 3' }),
      node({
        id: 'child-second',
        parentNodeId: 'phase-1',
        title: 'Second child',
      }),
      node({
        id: 'child-first',
        parentNodeId: 'phase-1',
        title: 'First child',
      }),
      node({ id: 'support', title: 'Support system' }),
    ];
    const edges = [
      edge({ id: 'phase-1-2', source: 'phase-1', target: 'phase-2' }),
      edge({ id: 'phase-2-3', source: 'phase-2', target: 'phase-3' }),
      edge({ id: 'child-flow', source: 'child-first', target: 'child-second' }),
      edge({
        edgeType: 'supports',
        id: 'support-phase-1',
        label: 'supports delivery',
        source: 'support',
        target: 'phase-1',
      }),
    ];

    const organized = organizeMindLayout({
      edges: toFlowEdges(edges),
      nodes: toFlowNodes(nodes),
    });
    const byId = new Map(organized.map((item) => [item.id, item]));

    expect(byId.get('phase-1')?.position.y).toBe(0);
    expect(byId.get('phase-2')?.position.y).toBe(0);
    expect(byId.get('phase-3')?.position.y).toBe(0);
    expect(byId.get('phase-1')?.position.x).toBeLessThan(
      byId.get('phase-2')?.position.x ?? 0
    );
    expect(byId.get('phase-2')?.position.x).toBeLessThan(
      byId.get('phase-3')?.position.x ?? 0
    );
    expect(byId.get('child-first')?.position.y).toBeGreaterThan(
      byId.get('phase-1')?.position.y ?? 0
    );
    expect(byId.get('child-first')?.position.x).toBeLessThan(
      byId.get('child-second')?.position.x ?? 0
    );
    expect(byId.get('support')?.position.y).toBeGreaterThan(
      byId.get('child-first')?.position.y ?? 0
    );
  });

  it('builds dynamic group frames with larger padding for larger child groups', () => {
    const nodes = [
      node({ id: 'parent', nodeType: 'milestone', title: 'Parent' }),
      node({ id: 'child-1', parentNodeId: 'parent', title: 'Child 1' }),
      node({ id: 'child-2', parentNodeId: 'parent', title: 'Child 2' }),
      node({ id: 'child-3', parentNodeId: 'parent', title: 'Child 3' }),
    ];
    const organized = organizeMindLayout({
      edges: [],
      nodes: toFlowNodes(nodes),
    });
    const frames = getMindGroupFrames({ edges: [], nodes: organized });
    const childFrame = frames.find((frame) => frame.kind === 'children');

    expect(childFrame?.childCount).toBe(3);
    expect(childFrame?.width).toBeGreaterThan(3 * 280 + 2 * 56);
  });

  it('keeps same-kind group frames separated with collision-safe gaps', () => {
    const nodes = [
      node({ id: 'parent-a', nodeType: 'milestone', title: 'Parent A' }),
      node({ id: 'child-a', parentNodeId: 'parent-a', title: 'Child A' }),
      node({ id: 'parent-b', nodeType: 'milestone', title: 'Parent B' }),
      node({ id: 'child-b', parentNodeId: 'parent-b', title: 'Child B' }),
    ];
    const organized = organizeMindLayout({
      edges: [],
      nodes: toFlowNodes(nodes),
    });
    const frames = getMindGroupFrames({ edges: [], nodes: organized });
    const children = frames.filter((frame) => frame.kind === 'children');

    expect(children).toHaveLength(2);
    expect(framesCollide(children[0], children[1], 120)).toBe(false);
  });

  it('maps manual group-frame links onto persisted node ids with frame metadata', () => {
    const organized = organizeMindLayout({
      edges: [],
      nodes: toFlowNodes([
        node({ id: 'parent', nodeType: 'milestone', title: 'Parent' }),
        node({ id: 'child', parentNodeId: 'parent', title: 'Child' }),
        node({ id: 'external', positionX: 700, title: 'External' }),
      ]),
    });
    const frames = getMindGroupFrames({ edges: [], nodes: organized });
    const childFrame = frames.find((frame) => frame.kind === 'children');
    const edge = createMindConnectionEdge({
      frames,
      source: 'external',
      target: childFrame?.id,
    });

    expect(edge?.sourceNodeId).toBe('external');
    expect(edge?.targetNodeId).toBe('parent');
    expect(edge?.metadata.targetFrameId).toBe(childFrame?.id);
  });

  it('adds obstacle context while preserving natural handles for nearby targets', () => {
    const nodes = toFlowNodes([
      node({ id: 'source', title: 'Source' }),
      node({ id: 'target-a', positionX: 400, title: 'Target A' }),
      node({
        id: 'target-b',
        positionX: 400,
        positionY: 260,
        title: 'Target B',
      }),
      node({ id: 'middle', positionX: 180, title: 'Middle obstacle' }),
    ]);
    const flowEdges = toFlowEdgesWithNodes(
      [
        edge({ id: 'edge-a', source: 'source', target: 'target-a' }),
        edge({ id: 'edge-b', source: 'source', target: 'target-b' }),
      ],
      nodes
    );

    expect(flowEdges[0]?.data?.obstacles?.map((item) => item.id)).toContain(
      'middle'
    );
    expect(flowEdges.map((item) => item.sourceHandle)).toEqual([
      'connection-right',
      'connection-right',
    ]);
  });

  it('uses natural vertical handles for stacked relationships before spreading handles', () => {
    const nodes = toFlowNodes([
      node({ id: 'target', positionY: 0, title: 'Target' }),
      node({ id: 'source', positionY: 300, title: 'Source' }),
    ]);
    const [flowEdge] = toFlowEdgesWithNodes(
      [
        edge({
          edgeType: 'supports',
          id: 'stacked-support',
          source: 'source',
          target: 'target',
        }),
      ],
      nodes
    );

    expect(flowEdge?.sourceHandle).toBe('connection-top');
    expect(flowEdge?.targetHandle).toBe('connection-bottom');
  });

  it('uses straight relationship paths first and detours around node obstacles', () => {
    const straight = buildRelationshipRoute({
      fallbackPositions: { source: Position.Right, target: Position.Left },
      obstacles: [],
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
    });
    const detour = buildRelationshipRoute({
      fallbackPositions: { source: Position.Right, target: Position.Left },
      obstacles: [
        {
          height: 30,
          id: 'blocked',
          width: 30,
          x: 45,
          y: -15,
        },
      ],
      source: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
    });

    expect(straight.path).toBe('M 0 0 L 100 0');
    expect(detour.path).not.toBe(straight.path);
    expect(detour.path).toContain('L');
  });

  it('prefers orthogonal routes and one-line labels when there is clear horizontal room', () => {
    const orthogonal = buildRelationshipRoute({
      fallbackPositions: { source: Position.Right, target: Position.Left },
      obstacles: [],
      source: { x: 0, y: 0 },
      target: { x: 220, y: 120 },
    });
    const roomy = buildRelationshipRoute({
      fallbackPositions: { source: Position.Right, target: Position.Left },
      obstacles: [],
      source: { x: 0, y: 0 },
      target: { x: 260, y: 0 },
    });

    expect(orthogonal.path).not.toBe('M 0 0 L 220 120');
    expect(orthogonal.path).toContain('L 220 0');
    expect(roomy.label.oneLine).toBe(true);
    expect(roomy.label.maxWidth).toBeGreaterThan(200);
  });

  it('moves relationship labels away from blocked center segments', () => {
    const route = buildRelationshipRoute({
      fallbackPositions: { source: Position.Right, target: Position.Left },
      labelObstacles: [
        {
          height: 56,
          id: 'blocking-node',
          width: 64,
          x: 100,
          y: -28,
        },
      ],
      labelText: 'ok',
      obstacles: [],
      source: { x: 0, y: 0 },
      target: { x: 260, y: 0 },
    });

    expect(Math.abs(route.label.y)).toBeGreaterThanOrEqual(50);
  });

  it('keeps vertical relationship labels on their own line when possible', () => {
    const route = buildRelationshipRoute({
      fallbackPositions: { source: Position.Top, target: Position.Bottom },
      labelText: 'required for launch',
      obstacles: [],
      source: { x: 0, y: 260 },
      target: { x: 0, y: 0 },
    });

    expect(route.label.x).toBe(0);
  });

  it('moves labels along their relationship line before offsetting them', () => {
    const route = buildRelationshipRoute({
      fallbackPositions: { source: Position.Top, target: Position.Bottom },
      labelObstacles: [
        {
          height: 28,
          id: 'other-line',
          width: 320,
          x: -160,
          y: 116,
        },
      ],
      labelText: 'required for launch',
      obstacles: [],
      source: { x: 0, y: 260 },
      target: { x: 0, y: 0 },
    });

    expect(route.label.x).toBe(0);
    expect(route.label.y).not.toBe(130);
  });

  it('exports the current board as markdown and json snapshots', () => {
    const snapshot = boardSnapshot([
      node({ id: 'parent', nodeType: 'milestone', title: 'Parent' }),
      node({ id: 'child', parentNodeId: 'parent', title: 'Child' }),
    ]);
    const edges = [edge({ id: 'edge-1', source: 'parent', target: 'child' })];

    const markdown = formatMindBoardAsMarkdown({
      edges,
      nodes: snapshot.nodes,
      snapshot,
    });
    const json = JSON.parse(
      formatMindBoardAsJson({ edges, nodes: snapshot.nodes, snapshot })
    );

    expect(markdown).toContain('# Test board');
    expect(markdown).toContain('- Parent');
    expect(markdown).toContain('  - Child');
    expect(markdown).toContain('Parent -> Child');
    expect(json.nodes).toHaveLength(2);
    expect(json.edges).toHaveLength(1);
  });

  it('keeps loose generated UI titles visible by normalizing top-level props', () => {
    const spec = resolveMindRenderUiSpec({
      spec: {
        elements: {
          item: {
            children: [],
            props: {},
            title: 'Dependency gaps',
            type: 'ListItem',
          },
          root: {
            children: ['item'],
            props: {},
            title: 'Analysis',
            type: 'Card',
          },
        },
        root: 'root',
      },
    });

    expect(spec?.elements.root?.props.title).toBe('Analysis');
    expect(spec?.elements.item?.props.title).toBe('Dependency gaps');
  });
});

function node(
  patch: Partial<MindNode> & Pick<MindNode, 'id' | 'title'>
): MindNode {
  return {
    body: null,
    color: '#2f80ed',
    createdAt: now,
    height: 120,
    horizon: 'quarter',
    metadata: {},
    nodeType: 'idea',
    parentNodeId: null,
    positionX: 0,
    positionY: 0,
    status: 'planned',
    updatedAt: now,
    width: 240,
    ...patch,
  };
}

function framesCollide(
  a: { height: number; width: number; x: number; y: number } | undefined,
  b: { height: number; width: number; x: number; y: number } | undefined,
  gap: number
) {
  if (!a || !b) return true;

  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function edge({
  edgeType = 'sequence',
  id,
  label = null,
  source,
  target,
}: {
  edgeType?: MindEdge['edgeType'];
  id: string;
  label?: string | null;
  source: string;
  target: string;
}): MindEdge {
  return {
    color: null,
    createdAt: now,
    edgeType,
    id,
    label,
    metadata: {},
    sourceNodeId: source,
    targetNodeId: target,
    updatedAt: now,
    weight: 1,
  };
}

function boardSnapshot(nodes: MindNode[]): MindBoardSnapshot {
  return {
    board: {
      canvasView: null,
      createdAt: now,
      defaultHorizon: 'year',
      description: null,
      edgeCount: 0,
      id: 'board-1',
      nodeCount: nodes.length,
      settings: {},
      status: 'active',
      tagCount: 0,
      title: 'Test board',
      updatedAt: now,
      wsId: 'ws-1',
    },
    edges: [],
    groups: [],
    links: [],
    nodes,
    tags: [],
  };
}
