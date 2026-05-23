import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMindBoardGraphSnapshot,
  listMindAiPatches,
} from './repository-snapshot';

const mocks = vi.hoisted(() => ({
  callMindRpc: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('./repository-rpc', () => ({
  callMindRpc: (...args: Parameters<typeof mocks.callMindRpc>) =>
    mocks.callMindRpc(...args),
}));

describe('Mind repository snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the split patch-list RPC when production has it available', async () => {
    const patch = patchRecord();
    mocks.callMindRpc.mockResolvedValueOnce([patch]);

    await expect(
      listMindAiPatches({ boardId: 'board-1', wsId: 'workspace-1' })
    ).resolves.toEqual([patch]);

    expect(mocks.callMindRpc).toHaveBeenCalledWith('mind_list_ai_patches', {
      p_board_id: 'board-1',
      p_limit: 20,
      p_ws_id: 'workspace-1',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('falls back to the private patch table when the split RPC cannot be used', async () => {
    const table = createPatchTableMock([patchRow()]);
    mocks.callMindRpc.mockRejectedValueOnce(
      new Error(
        'Could not find the function private.mind_list_ai_patches in the schema cache'
      )
    );
    mocks.createAdminClient.mockResolvedValueOnce(table.adminClient);

    await expect(
      listMindAiPatches({
        boardId: 'board-1',
        limit: 250,
        wsId: 'workspace-1',
      })
    ).resolves.toEqual([patchRecord()]);

    expect(table.adminClient.schema).toHaveBeenCalledWith('private');
    expect(table.schemaClient.from).toHaveBeenCalledWith('mind_ai_patches');
    expect(table.table.select).toHaveBeenCalledWith(
      [
        'id',
        'thread_id',
        'board_id',
        'created_by',
        'summary',
        'patch',
        'status',
        'applied_at',
        'created_at',
      ].join(',')
    );
    expect(table.query.eq).toHaveBeenCalledWith('board_id', 'board-1');
    expect(table.query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(table.query.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(table.query.limit).toHaveBeenCalledWith(100);
  });

  it('falls back to the full snapshot RPC when the graph-only RPC is unavailable', async () => {
    mocks.callMindRpc
      .mockRejectedValueOnce(new Error('PGRST202: schema cache miss'))
      .mockResolvedValueOnce({ ...graphSnapshot(), patches: [patchRecord()] });

    await expect(
      getMindBoardGraphSnapshot('workspace-1', 'board-1')
    ).resolves.toEqual(graphSnapshot());

    expect(mocks.callMindRpc).toHaveBeenNthCalledWith(
      1,
      'mind_get_board_graph_snapshot',
      {
        p_board_id: 'board-1',
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.callMindRpc).toHaveBeenNthCalledWith(
      2,
      'mind_get_board_snapshot',
      {
        p_board_id: 'board-1',
        p_ws_id: 'workspace-1',
      }
    );
  });
});

function createPatchTableMock(data: unknown[]) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error: null })),
    order: vi.fn(() => query),
  };
  const table = {
    select: vi.fn(() => query),
  };
  const schemaClient = {
    from: vi.fn(() => table),
  };
  const adminClient = {
    schema: vi.fn(() => schemaClient),
  };

  return { adminClient, query, schemaClient, table };
}

function graphSnapshot() {
  return {
    board: {
      canvasView: null,
      createdAt: '2026-05-23T00:00:00.000Z',
      defaultHorizon: 'year',
      description: null,
      edgeCount: 0,
      id: 'board-1',
      nodeCount: 0,
      settings: {},
      status: 'active',
      tagCount: 0,
      title: 'Roadmap',
      updatedAt: '2026-05-23T00:00:00.000Z',
      wsId: 'workspace-1',
    },
    edges: [],
    groups: [],
    links: [],
    nodes: [],
    tags: [],
  };
}

function patchRecord() {
  return {
    appliedAt: null,
    boardId: 'board-1',
    createdAt: '2026-05-23T00:00:00.000Z',
    createdBy: 'user-1',
    id: 'patch-1',
    patch: {
      operations: [],
      summary: 'Create roadmap',
    },
    status: 'draft',
    summary: 'Create roadmap',
    threadId: 'thread-1',
  };
}

function patchRow() {
  return {
    applied_at: null,
    board_id: 'board-1',
    created_at: '2026-05-23T00:00:00.000Z',
    created_by: 'user-1',
    id: 'patch-1',
    patch: {
      operations: [],
      summary: 'Create roadmap',
    },
    status: 'draft',
    summary: 'Create roadmap',
    thread_id: 'thread-1',
  };
}
