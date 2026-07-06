import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_WS_ID = '22222222-2222-4222-8222-222222222222';
const PERSONAL_WS_ID = '33333333-3333-4333-8333-333333333333';
const PERSONAL_BOARD_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_BOARD_ID = '66666666-6666-4666-8666-666666666666';
const PERSONAL_SOURCE_BOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSONAL_LIST_ID = '77777777-7777-4777-8777-777777777777';
const PREVIOUS_TASK_ID = '88888888-8888-4888-8888-888888888888';
const NEXT_TASK_ID = '99999999-9999-4999-8999-999999999999';

const mocks = vi.hoisted(() => {
  const adminRpc = vi.fn();
  const sourceTaskMaybeSingle = vi.fn();
  const targetBoardMaybeSingle = vi.fn();
  const targetListMaybeSingle = vi.fn();
  const placementRpc = vi.fn();

  const adminClient = {
    rpc: adminRpc,
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: sourceTaskMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_boards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: targetBoardMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'task_lists') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: targetListMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'task_user_overrides') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(),
            })),
          })),
        };
      }

      return {};
    }),
  };

  const verifyWorkspaceMembershipType = vi.fn();

  return {
    adminRpc,
    adminClient,
    placementRpc,
    sourceTaskMaybeSingle,
    targetBoardMaybeSingle,
    targetListMaybeSingle,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  getPersonalExternalStagingListId: (boardId: string) =>
    `personal-external-staging:${boardId}`,
  isPersonalExternalStagingListId: (listId: string | null | undefined) =>
    typeof listId === 'string' &&
    listId.startsWith('personal-external-staging:'),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

type PlacementRouteHandler = (
  request: NextRequest,
  context: unknown,
  params: { taskId: string }
) => Promise<Response>;

function sourceTaskRow({
  sourceBoardId = SOURCE_BOARD_ID,
  sourceWorkspaceId = SOURCE_WS_ID,
  sourceWorkspacePersonal = false,
}: {
  sourceBoardId?: string;
  sourceWorkspaceId?: string;
  sourceWorkspacePersonal?: boolean;
} = {}) {
  return {
    id: TASK_ID,
    display_number: 7,
    name: 'External source task',
    description: null,
    priority: 'normal',
    completed: false,
    completed_at: null,
    sort_key: 100,
    start_date: null,
    end_date: null,
    estimation_points: null,
    created_at: '2026-05-06T00:00:00.000Z',
    list_id: '55555555-5555-4555-8555-555555555555',
    closed_at: null,
    deleted_at: null,
    task_lists: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Source List',
      status: 'active',
      color: 'BLUE',
      deleted: false,
      board_id: sourceBoardId,
      workspace_boards: {
        id: sourceBoardId,
        name: 'Source Board',
        ticket_prefix: 'SRC',
        ws_id: sourceWorkspaceId,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: sourceWorkspaceId,
          name: 'Source Workspace',
          personal: sourceWorkspacePersonal,
        },
      },
    },
  };
}

describe('current-user task personal-placement route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.adminClient.from.mockClear();
    mocks.adminRpc.mockReset();
    mocks.sourceTaskMaybeSingle.mockReset();
    mocks.targetBoardMaybeSingle.mockReset();
    mocks.targetListMaybeSingle.mockReset();
    mocks.placementRpc.mockReset();
    mocks.verifyWorkspaceMembershipType.mockReset();
  });

  it('stages an accessible external task on a personal board without changing the source list', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: PERSONAL_WS_ID,
          personal: true,
        },
      },
      error: null,
    });
    mocks.placementRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: null,
          personal_sort_key: null,
          personal_added_at: '2026-05-06T01:00:00.000Z',
          personal_placed_at: null,
        },
      ],
      error: null,
    });

    const { PUT } =
      await import('@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route');
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: null,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: { rpc: mocks.placementRpc },
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.placementRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      {
        p_task_id: TASK_ID,
        p_user_id: 'user-1',
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: null,
        p_personal_sort_key: null,
        p_previous_task_id: null,
        p_next_task_id: null,
      }
    );
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        is_personal_external: true,
        list_id: `personal-external-staging:${PERSONAL_BOARD_ID}`,
        source_board_id: SOURCE_BOARD_ID,
        source_workspace_id: SOURCE_WS_ID,
      })
    );
  });

  it('places an external task into a personal list through the placement RPC', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: PERSONAL_WS_ID,
          personal: true,
        },
      },
      error: null,
    });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_LIST_ID,
        board_id: PERSONAL_BOARD_ID,
        deleted: false,
      },
      error: null,
    });
    mocks.placementRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: PERSONAL_LIST_ID,
          personal_sort_key: 1_500_000,
          personal_added_at: '2026-05-06T01:00:00.000Z',
          personal_placed_at: '2026-05-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } =
      await import('@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route');
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: PERSONAL_LIST_ID,
            previous_task_id: PREVIOUS_TASK_ID,
            next_task_id: NEXT_TASK_ID,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: { rpc: mocks.placementRpc },
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.placementRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      {
        p_task_id: TASK_ID,
        p_user_id: 'user-1',
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: PERSONAL_LIST_ID,
        p_personal_sort_key: null,
        p_previous_task_id: PREVIOUS_TASK_ID,
        p_next_task_id: NEXT_TASK_ID,
      }
    );
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        is_personal_external: true,
        list_id: PERSONAL_LIST_ID,
        personal_list_id: PERSONAL_LIST_ID,
        sort_key: 1_500_000,
        source_workspace_id: SOURCE_WS_ID,
      })
    );
  });

  it('places a task from another board in the same personal workspace', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow({
        sourceBoardId: PERSONAL_SOURCE_BOARD_ID,
        sourceWorkspaceId: PERSONAL_WS_ID,
        sourceWorkspacePersonal: true,
      }),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: PERSONAL_WS_ID,
          personal: true,
        },
      },
      error: null,
    });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_LIST_ID,
        board_id: PERSONAL_BOARD_ID,
        deleted: false,
      },
      error: null,
    });
    mocks.placementRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: PERSONAL_LIST_ID,
          personal_sort_key: 1_500_000,
          personal_added_at: '2026-05-06T01:00:00.000Z',
          personal_placed_at: '2026-05-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } =
      await import('@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route');
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: PERSONAL_LIST_ID,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: { rpc: mocks.placementRpc },
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.placementRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_task_id: TASK_ID,
        p_user_id: 'user-1',
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: PERSONAL_LIST_ID,
      })
    );
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        is_personal_external: true,
        list_id: PERSONAL_LIST_ID,
        source_board_id: PERSONAL_SOURCE_BOARD_ID,
        source_workspace_id: PERSONAL_WS_ID,
      })
    );
  });

  it('rejects native same-board personal tasks on the placement route', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow({
        sourceBoardId: PERSONAL_BOARD_ID,
        sourceWorkspaceId: PERSONAL_WS_ID,
        sourceWorkspacePersonal: true,
      }),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: PERSONAL_WS_ID,
          personal: true,
        },
      },
      error: null,
    });

    const { PUT } =
      await import('@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route');
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: null,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: { rpc: mocks.placementRpc },
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        'Only external workspace tasks or board-external personal tasks can be placed on a personal board',
    });
    expect(mocks.placementRpc).not.toHaveBeenCalled();
  });

  it('rejects non-personal destination boards', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: {
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: PERSONAL_WS_ID,
          personal: false,
        },
      },
      error: null,
    });

    const { PUT } =
      await import('@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route');
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: { rpc: mocks.placementRpc },
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Destination board must be personal',
    });
    expect(mocks.placementRpc).not.toHaveBeenCalled();
  });
});
