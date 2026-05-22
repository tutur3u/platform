import { describe, expect, it, vi } from 'vitest';
import {
  coerceMindAiPatch,
  createMindStreamTools,
  type MindToolCallbacks,
  normalizeGeneratedPatchIds,
} from './tools';
import type { MindBoardSnapshot } from './types';

describe('normalizeGeneratedPatchIds', () => {
  it('generates missing node and edge ids and resolves operation-id edge refs', () => {
    const patch = normalizeGeneratedPatchIds({
      operations: [
        {
          id: 'add_devops_node',
          kind: 'create_node',
          node: {
            horizon: 'month',
            id: 'devops_node',
            nodeType: 'idea',
            positionX: 0,
            positionY: 300,
            status: 'planned',
            title: 'DevOps & Infrastructure',
          },
        },
        {
          id: 'add_mvp_node',
          kind: 'create_node',
          node: {
            id: 'mvp_node',
            horizon: 'quarter',
            nodeType: 'milestone',
            positionX: 0,
            positionY: 0,
            status: 'planned',
            title: 'Phase 1: MVP',
          },
        },
        {
          edge: {
            edgeType: 'supports',
            id: 'devops_mvp_edge',
            label: 'supports delivery',
            sourceNodeId: 'add_devops_node',
            targetNodeId: 'mvp_node',
          },
          id: 'link_devops_to_mvp',
          kind: 'create_edge',
        },
      ],
      summary: 'Add technical foundation nodes.',
    });
    const [devopsOperation, mvpOperation, edgeOperation] = patch.operations;

    expect(devopsOperation?.kind).toBe('create_node');
    expect(mvpOperation?.kind).toBe('create_node');
    expect(edgeOperation?.kind).toBe('create_edge');
    if (
      devopsOperation?.kind !== 'create_node' ||
      mvpOperation?.kind !== 'create_node' ||
      edgeOperation?.kind !== 'create_edge'
    ) {
      throw new Error('Unexpected patch shape');
    }

    expect(devopsOperation.node.id).toMatch(UUID_PATTERN);
    expect(mvpOperation.node.id).toMatch(UUID_PATTERN);
    expect(edgeOperation.edge.id).toMatch(UUID_PATTERN);
    expect(edgeOperation.edge.sourceNodeId).toBe(devopsOperation.node.id);
    expect(edgeOperation.edge.targetNodeId).toBe(mvpOperation.node.id);
  });

  it('resolves created-node aliases in update operations without inventing unknown refs', () => {
    const patch = normalizeGeneratedPatchIds({
      operations: [
        {
          id: 'create_parent',
          kind: 'create_node',
          node: {
            id: 'parent_alias',
            positionX: 0,
            positionY: 0,
            title: 'New parent',
          },
        },
        {
          id: 'reparent_existing',
          kind: 'update_node',
          nodeId: EXISTING_NODE_ID,
          parentNodeId: 'parent_alias',
        },
        {
          edgeId: EXISTING_EDGE_ID,
          id: 'reroute_edge',
          kind: 'update_edge',
          sourceNodeId: 'parent_alias',
          targetNodeId: EXISTING_NODE_ID,
        },
      ],
      summary: 'Use the new parent in updates.',
    });
    const [createNode, updateNode, updateEdge] = patch.operations;

    expect(createNode?.kind).toBe('create_node');
    expect(updateNode?.kind).toBe('update_node');
    expect(updateEdge?.kind).toBe('update_edge');
    if (
      createNode?.kind !== 'create_node' ||
      updateNode?.kind !== 'update_node' ||
      updateEdge?.kind !== 'update_edge'
    ) {
      throw new Error('Unexpected patch shape');
    }

    expect(updateNode.parentNodeId).toBe(createNode.node.id);
    expect(updateEdge.sourceNodeId).toBe(createNode.node.id);
    expect(updateEdge.targetNodeId).toBe(EXISTING_NODE_ID);
  });
});

describe('coerceMindAiPatch', () => {
  it('accepts nested update payloads and non-canonical generated enums', () => {
    const patch = coerceMindAiPatch({
      operations: [
        {
          id: 'update_baseline',
          kind: 'update_node',
          node: {
            body: 'Define privacy-by-design requirements for MVP launch.',
            id: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
            title: 'Compliance Baseline & Data Privacy',
          },
        },
        {
          id: 'add_encryption_task',
          kind: 'create_node',
          node: {
            body: 'Implement encryption for sensitive data at rest.',
            horizon: 'month',
            id: 'node_encryption_task',
            nodeType: 'action',
            parentNodeId: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
            status: 'planned',
            title: 'Encryption Strategy Implementation',
          },
        },
        {
          edge: {
            edgeType: 'validates',
            id: '9da91129-e15f-4774-9a89-ad40199e2b51',
            label: 'blocks MVP release until satisfied',
          },
          id: 'update_dependency_edge',
          kind: 'update_edge',
        },
      ],
      summary: 'Refine Compliance Baseline structure.',
    });

    expect('issues' in patch).toBe(false);
    if ('issues' in patch) throw new Error('Unexpected coercion failure');

    expect(patch.operations[0]).toMatchObject({
      kind: 'update_node',
      nodeId: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
      title: 'Compliance Baseline & Data Privacy',
    });
    expect(patch.operations[1]).toMatchObject({
      kind: 'create_node',
      node: {
        nodeType: 'idea',
        positionX: 320,
        positionY: 240,
      },
    });
    expect(patch.operations[2]).toMatchObject({
      edgeId: '9da91129-e15f-4774-9a89-ad40199e2b51',
      edgeType: 'supports',
      kind: 'update_edge',
    });
  });
});

describe('propose_mind_patch reference validation', () => {
  it('allows edges to reference nodes created in the same patch', async () => {
    const callbacks = createCallbacks();
    const tools = createMindStreamTools(
      {
        boardId: BOARD_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
        writeMode: 'review',
        wsId: WS_ID,
      },
      callbacks
    );
    const proposePatchTool = getToolExecute(tools.propose_mind_patch);

    const result = await proposePatchTool({
      boardId: BOARD_ID,
      patch: {
        operations: [
          {
            id: 'create_child',
            kind: 'create_node',
            node: {
              id: 'child_alias',
              parentNodeId: EXISTING_NODE_ID,
              positionX: 320,
              positionY: 240,
              title: 'Follow-up milestone',
            },
          },
          {
            edge: {
              edgeType: 'sequence',
              id: 'edge_to_child',
              sourceNodeId: EXISTING_NODE_ID,
              targetNodeId: 'child_alias',
            },
            id: 'connect_child',
            kind: 'create_edge',
          },
        ],
        summary: 'Add follow-up milestone',
      },
    });

    expect(result).toMatchObject({ ok: true });
    expect(callbacks.createPatch).toHaveBeenCalledTimes(1);

    const createdPatch = callbacks.createPatch.mock.calls[0]?.[0].patch;
    const createNode = createdPatch?.operations[0];
    const createEdge = createdPatch?.operations[1];
    expect(createNode?.kind).toBe('create_node');
    expect(createEdge?.kind).toBe('create_edge');
    if (
      createNode?.kind !== 'create_node' ||
      createEdge?.kind !== 'create_edge'
    ) {
      throw new Error('Unexpected patch shape');
    }

    expect(createNode.node.id).toMatch(UUID_PATTERN);
    expect(createEdge.edge.targetNodeId).toBe(createNode.node.id);
  });

  it('rejects drafts that update or delete missing graph entities', async () => {
    const callbacks = createCallbacks();
    const tools = createMindStreamTools(
      {
        boardId: BOARD_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
        writeMode: 'review',
        wsId: WS_ID,
      },
      callbacks
    );
    const proposePatchTool = getToolExecute(tools.propose_mind_patch);

    const result = await proposePatchTool({
      boardId: BOARD_ID,
      patch: {
        operations: [
          {
            id: 'rename_missing',
            kind: 'update_node',
            nodeId: MISSING_NODE_ID,
            title: 'Missing node',
          },
          {
            edgeId: MISSING_EDGE_ID,
            id: 'remove_missing_edge',
            kind: 'delete_edge',
          },
        ],
        summary: 'Touch missing entities',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Missing node'),
    });
    expect(callbacks.createPatch).not.toHaveBeenCalled();
  });

  it('rejects unknown parent and edge references instead of generating random UUIDs', async () => {
    const callbacks = createCallbacks();
    const tools = createMindStreamTools(
      {
        boardId: BOARD_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
        writeMode: 'review',
        wsId: WS_ID,
      },
      callbacks
    );
    const proposePatchTool = getToolExecute(tools.propose_mind_patch);

    const result = await proposePatchTool({
      boardId: BOARD_ID,
      patch: {
        operations: [
          {
            id: 'create_orphan',
            kind: 'create_node',
            node: {
              id: 'orphan_alias',
              parentNodeId: 'missing_parent_alias',
              positionX: 320,
              positionY: 240,
              title: 'Orphan child',
            },
          },
          {
            edge: {
              sourceNodeId: EXISTING_NODE_ID,
              targetNodeId: 'missing_target_alias',
            },
            id: 'connect_missing',
            kind: 'create_edge',
          },
        ],
        summary: 'Create impossible references',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('missing_parent_alias'),
    });
    expect(callbacks.createPatch).not.toHaveBeenCalled();
  });
});

function getToolExecute(tool: unknown) {
  const executable = tool as {
    execute?: (
      args: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
  };

  if (typeof executable.execute !== 'function') {
    throw new Error('Mind tool execute is not available');
  }

  return executable.execute;
}

function createCallbacks(): MindToolCallbacks & {
  createPatch: ReturnType<typeof vi.fn>;
} {
  return {
    applyPatch: vi.fn(async () => null),
    createPatch: vi.fn(
      async ({
        boardId,
        patch,
        summary,
        threadId,
        userId,
      }: Parameters<MindToolCallbacks['createPatch']>[0]) => ({
        appliedAt: null,
        boardId,
        createdAt: '2026-05-22T00:00:00.000Z',
        createdBy: userId,
        id: '77777777-7777-4777-8777-777777777777',
        patch,
        status: 'draft' as const,
        summary,
        threadId: threadId ?? null,
      })
    ),
    getSnapshot: vi.fn(async () => snapshot),
    listBoards: vi.fn(async () => [snapshot.board]),
    searchNodes: vi.fn(async () => snapshot.nodes),
  };
}

const WS_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const THREAD_ID = '44444444-4444-4444-8444-444444444444';
const EXISTING_NODE_ID = '55555555-5555-4555-8555-555555555555';
const EXISTING_EDGE_ID = '66666666-6666-4666-8666-666666666666';
const MISSING_NODE_ID = '88888888-8888-4888-8888-888888888888';
const MISSING_EDGE_ID = '99999999-9999-4999-8999-999999999999';

const snapshot: MindBoardSnapshot = {
  board: {
    canvasView: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    defaultHorizon: 'year',
    description: null,
    edgeCount: 1,
    id: BOARD_ID,
    nodeCount: 1,
    settings: {},
    status: 'active',
    tagCount: 0,
    title: 'Roadmap',
    updatedAt: '2026-05-22T00:00:00.000Z',
    wsId: WS_ID,
  },
  edges: [
    {
      color: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      edgeType: 'relates_to',
      id: EXISTING_EDGE_ID,
      label: null,
      metadata: {},
      sourceNodeId: EXISTING_NODE_ID,
      targetNodeId: EXISTING_NODE_ID,
      updatedAt: '2026-05-22T00:00:00.000Z',
      weight: 1,
    },
  ],
  groups: [],
  links: [],
  nodes: [
    {
      body: null,
      color: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      height: 120,
      horizon: 'year',
      id: EXISTING_NODE_ID,
      metadata: {},
      nodeType: 'plan',
      parentNodeId: null,
      positionX: 0,
      positionY: 0,
      status: 'planned',
      title: 'Existing plan',
      updatedAt: '2026-05-22T00:00:00.000Z',
      width: 240,
    },
  ],
  tags: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
