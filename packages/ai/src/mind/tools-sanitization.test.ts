import { describe, expect, it, vi } from 'vitest';
import { createMindStreamTools, type MindToolCallbacks } from './tools';
import type { MindBoardSnapshot } from './types';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const THREAD_ID = '44444444-4444-4444-8444-444444444444';
const NODE_ID = '55555555-5555-4555-8555-555555555555';

const snapshot: MindBoardSnapshot = {
  board: {
    canvasView: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    defaultHorizon: 'year',
    description: null,
    edgeCount: 0,
    id: BOARD_ID,
    nodeCount: 1,
    settings: {},
    status: 'active',
    tagCount: 0,
    title: 'Roadmap',
    updatedAt: '2026-05-22T00:00:00.000Z',
    wsId: WS_ID,
  },
  edges: [],
  groups: [],
  links: [],
  nodes: [
    {
      body: null,
      color: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      height: 120,
      horizon: 'year',
      id: NODE_ID,
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

describe('Mind stream tool error sanitization', () => {
  it('sanitizes RPC exceptions from apply_mind_patch and propose_mind_patch', async () => {
    const callbacks: MindToolCallbacks = {
      applyPatch: vi.fn(async () => {
        throw new Error('pg_error: relation private.mind_patches failed');
      }),
      createPatch: vi.fn(async () => {
        throw new Error('pg_error: constraint violation on mind_patches');
      }),
      getSnapshot: vi.fn(async () => snapshot),
      listBoards: vi.fn(async () => [snapshot.board]),
      searchNodes: vi.fn(async () => snapshot.nodes),
    };
    const tools = createMindStreamTools(
      {
        boardId: BOARD_ID,
        threadId: THREAD_ID,
        userId: USER_ID,
        writeMode: 'direct',
        wsId: WS_ID,
      },
      callbacks
    );

    const applyExec = (
      tools.apply_mind_patch as unknown as {
        execute: (args: Record<string, unknown>) => Promise<unknown>;
      }
    ).execute;
    const proposeExec = (
      tools.propose_mind_patch as unknown as {
        execute: (args: Record<string, unknown>) => Promise<unknown>;
      }
    ).execute;

    await expect(applyExec({ patchId: NODE_ID })).resolves.toEqual({
      ok: false,
      reason: 'Patch application failed.',
    });
    await expect(
      proposeExec({
        boardId: BOARD_ID,
        patch: {
          operations: [
            {
              id: 'rename_existing',
              kind: 'update_node',
              nodeId: NODE_ID,
              title: 'Updated plan',
            },
          ],
          summary: 'Rename plan',
        },
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'Patch creation failed.',
    });
  });
});
