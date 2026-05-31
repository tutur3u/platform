import { describe, expect, it } from 'vitest';
import { applyMindPatchToSnapshot } from './patch';
import type {
  MindAiPatch,
  MindBoardSnapshot,
  MindEdge,
  MindNode,
} from './types';

const snapshot: MindBoardSnapshot = {
  board: {
    canvasView: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    defaultHorizon: 'year',
    description: null,
    edgeCount: 1,
    id: 'board-1',
    nodeCount: 2,
    settings: {},
    status: 'active',
    tagCount: 0,
    title: 'Operating system',
    updatedAt: '2026-05-20T00:00:00.000Z',
    wsId: 'ws-1',
  },
  edges: [
    {
      color: null,
      createdAt: '2026-05-20T00:00:00.000Z',
      edgeType: 'depends_on',
      id: 'edge-1',
      label: 'feeds',
      metadata: {},
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      updatedAt: '2026-05-20T00:00:00.000Z',
      weight: 1,
    },
  ],
  groups: [],
  links: [],
  nodes: [
    {
      body: null,
      color: '#3b82f6',
      createdAt: '2026-05-20T00:00:00.000Z',
      height: 120,
      horizon: 'year',
      id: 'node-1',
      metadata: {},
      nodeType: 'goal',
      parentNodeId: null,
      positionX: 0,
      positionY: 0,
      status: 'planned',
      title: 'Ship Mind',
      updatedAt: '2026-05-20T00:00:00.000Z',
      width: 220,
    },
    {
      body: null,
      color: '#22c55e',
      createdAt: '2026-05-20T00:00:00.000Z',
      height: 120,
      horizon: 'five_year',
      id: 'node-2',
      metadata: {},
      nodeType: 'idea',
      parentNodeId: null,
      positionX: 360,
      positionY: 0,
      status: 'in_progress',
      title: 'Knowledge graph',
      updatedAt: '2026-05-20T00:00:00.000Z',
      width: 220,
    },
  ],
  tags: [],
};

describe('applyMindPatchToSnapshot', () => {
  it('creates, updates, deletes, and reconnects graph entities deterministically', () => {
    const patch: MindAiPatch = {
      operations: [
        {
          id: 'op-1',
          kind: 'update_node',
          nodeId: 'node-1',
          title: 'Ship Mind v1',
        },
        {
          id: 'op-2',
          kind: 'create_node',
          node: {
            body: 'AI review loop',
            color: '#f59e0b',
            horizon: 'ten_year',
            id: 'new-node',
            nodeType: 'plan',
            positionX: 720,
            positionY: 80,
            status: 'planned',
            title: 'Iteration engine',
          },
        },
        {
          edgeId: 'edge-1',
          id: 'op-3',
          kind: 'delete_edge',
        },
        {
          edge: {
            edgeType: 'supports',
            id: 'new-edge',
            label: 'powers',
            sourceNodeId: 'node-1',
            targetNodeId: 'new-node',
          },
          id: 'op-4',
          kind: 'create_edge',
        },
        {
          id: 'op-5',
          kind: 'delete_node',
          nodeId: 'node-2',
        },
      ],
      summary: 'Refine v1 planning direction',
    };

    const next = applyMindPatchToSnapshot(snapshot, patch);

    expect(next.nodes.map((node: MindNode) => [node.id, node.title])).toEqual([
      ['node-1', 'Ship Mind v1'],
      ['new-node', 'Iteration engine'],
    ]);
    expect(
      next.edges.map((edge: MindEdge) => [edge.id, edge.sourceNodeId])
    ).toEqual([['new-edge', 'node-1']]);
  });
});
