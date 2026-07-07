import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_WS_ID = '22222222-2222-4222-8222-222222222222';
const PERSONAL_WS_ID = '33333333-3333-4333-8333-333333333333';
const PERSONAL_BOARD_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_BOARD_ID = '66666666-6666-4666-8666-666666666666';
const PERSONAL_SOURCE_BOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STALE_PERSONAL_BOARD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PERSONAL_LIST_ID = '77777777-7777-4777-8777-777777777777';
const PERSONAL_DONE_LIST_ID = '12121212-1212-4121-8121-121212121212';
const PERSONAL_CLOSED_LIST_ID = '13131313-1313-4131-8131-131313131313';
const SOURCE_DONE_LIST_ID = '14141414-1414-4141-8141-141414141414';
const SOURCE_CLOSED_LIST_ID = '15151515-1515-4151-8151-151515151515';
const PREVIOUS_TASK_ID = '88888888-8888-4888-8888-888888888888';
const NEXT_TASK_ID = '99999999-9999-4999-8999-999999999999';
const PRODUCTION_PERSONAL_BOARD_ID = '2ad6c068-c69d-4011-a3c8-46ac45c3cd05';
const PRODUCTION_PERSONAL_LIST_ID = '16b3fb2f-49ce-4e2b-9d6d-04d9b6f6bc29';
const PRODUCTION_PREVIOUS_TASK_ID = 'fee133d5-45b3-4561-99ee-2c9b74753e5a';

const mocks = vi.hoisted(() => {
  const adminRpc = vi.fn();
  const sourceTaskMaybeSingle = vi.fn();
  const sourceAssignmentMaybeSingle = vi.fn();
  const targetBoardMaybeSingle = vi.fn();
  const targetListMaybeSingle = vi.fn();
  const taskListLimit = vi.fn();
  const userOverrideMaybeSingle = vi.fn();
  const resolveTaskBoardAccess = vi.fn();
  const withSessionAuth = vi.fn((handler: unknown) => handler);

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
        const taskListQuery = {
          eq: vi.fn(),
          limit: taskListLimit,
          maybeSingle: targetListMaybeSingle,
          order: vi.fn(),
          select: vi.fn(),
        };
        taskListQuery.select.mockReturnValue(taskListQuery);
        taskListQuery.eq.mockReturnValue(taskListQuery);
        taskListQuery.order.mockReturnValue(taskListQuery);
        return taskListQuery;
      }

      if (table === 'task_assignees') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: sourceAssignmentMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'task_user_overrides') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: userOverrideMaybeSingle,
              })),
            })),
          })),
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
    sourceAssignmentMaybeSingle,
    sourceTaskMaybeSingle,
    targetBoardMaybeSingle,
    targetListMaybeSingle,
    taskListLimit,
    userOverrideMaybeSingle,
    resolveTaskBoardAccess,
    verifyWorkspaceMembershipType,
    withSessionAuth,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
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

vi.mock('@tuturuuu/apis/tu-do/board-access', () => ({
  resolveTaskBoardAccess: (
    ...args: Parameters<typeof mocks.resolveTaskBoardAccess>
  ) => mocks.resolveTaskBoardAccess(...args),
}));

type PlacementRouteHandler = (
  request: NextRequest,
  context: unknown,
  params: { taskId: string }
) => Promise<Response>;

function sourceTaskRow({
  closedAt = null,
  completed = false,
  completedAt = null,
  listId = '55555555-5555-4555-8555-555555555555',
  listName = 'Source List',
  listStatus = 'active',
  sourceBoardId = SOURCE_BOARD_ID,
  sourceWorkspaceId = SOURCE_WS_ID,
  sourceWorkspacePersonal = false,
}: {
  closedAt?: string | null;
  completed?: boolean | null;
  completedAt?: string | null;
  listId?: string;
  listName?: string | null;
  listStatus?: string | null;
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
    completed,
    completed_at: completedAt,
    sort_key: 100,
    start_date: null,
    end_date: null,
    estimation_points: null,
    created_at: '2026-05-06T00:00:00.000Z',
    list_id: listId,
    closed_at: closedAt,
    deleted_at: null,
    task_lists: {
      id: listId,
      name: listName,
      status: listStatus,
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

function targetBoardRow({
  boardId = PERSONAL_BOARD_ID,
  workspaceId = PERSONAL_WS_ID,
  personal = true,
}: {
  boardId?: string;
  workspaceId?: string;
  personal?: boolean;
} = {}) {
  return {
    id: boardId,
    ws_id: workspaceId,
    deleted_at: null,
    archived_at: null,
    workspaces: {
      id: workspaceId,
      personal,
    },
  };
}

function targetListRow({
  boardId = PERSONAL_BOARD_ID,
  listId = PERSONAL_LIST_ID,
  listName = 'Personal List',
  listStatus = 'active',
  workspaceId = PERSONAL_WS_ID,
  personal = true,
}: {
  boardId?: string;
  listId?: string;
  listName?: string | null;
  listStatus?: string | null;
  workspaceId?: string;
  personal?: boolean;
} = {}) {
  return {
    id: listId,
    board_id: boardId,
    color: 'GREEN',
    created_at: '2026-05-05T00:00:00.000Z',
    deleted: false,
    name: listName,
    position: 1,
    status: listStatus,
    workspace_boards: targetBoardRow({
      boardId,
      workspaceId,
      personal,
    }),
  };
}

function terminalListRow({
  boardId,
  listId,
  name,
  status,
}: {
  boardId: string;
  listId: string;
  name: string;
  status: 'closed' | 'done';
}) {
  return {
    id: listId,
    board_id: boardId,
    color: status === 'done' ? 'GREEN' : 'PURPLE',
    created_at: '2026-05-05T00:00:00.000Z',
    deleted: false,
    name,
    position: 1,
    status,
  };
}

describe('current-user task personal-placement route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.adminClient.from.mockClear();
    mocks.adminRpc.mockReset();
    mocks.sourceAssignmentMaybeSingle.mockReset();
    mocks.sourceTaskMaybeSingle.mockReset();
    mocks.targetBoardMaybeSingle.mockReset();
    mocks.targetListMaybeSingle.mockReset();
    mocks.taskListLimit.mockReset();
    mocks.userOverrideMaybeSingle.mockReset();
    mocks.verifyWorkspaceMembershipType.mockReset();
    mocks.withSessionAuth.mockReset();
    mocks.withSessionAuth.mockImplementation((handler: unknown) => handler);
    mocks.resolveTaskBoardAccess.mockReset();
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      access: { mode: 'member', permission: 'edit' },
      board: { id: PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
      boardId: PERSONAL_BOARD_ID,
      sbAdmin: mocks.adminClient,
      supabase: {},
      user: { id: 'user-1' },
      wsId: PERSONAL_WS_ID,
    });
  });

  it('allows platform CLI, calendar, and Tasks app-session auth', async () => {
    await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );

    expect(mocks.withSessionAuth).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {
        allowAppSessionAuth: {
          targetApp: ['platform', 'calendar', 'tasks'],
        },
      }
    );
    expect(mocks.withSessionAuth).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {
        allowAppSessionAuth: {
          targetApp: ['platform', 'calendar', 'tasks'],
        },
      }
    );
  });

  it('stages an accessible external task on a personal board without changing the source list', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: targetBoardRow(),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
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

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
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
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow(),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
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

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.targetBoardMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.resolveTaskBoardAccess).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith(
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

  it('uses personal and source done defaults for terminal personal placement', async () => {
    mocks.sourceTaskMaybeSingle
      .mockResolvedValueOnce({
        data: sourceTaskRow(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: sourceTaskRow({
          closedAt: '2026-05-06T03:00:00.000Z',
          completed: true,
          completedAt: '2026-05-06T03:00:00.000Z',
          listId: SOURCE_DONE_LIST_ID,
          listName: 'Done',
          listStatus: 'done',
        }),
        error: null,
      });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle
      .mockResolvedValueOnce({
        data: targetBoardRow(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: { default_done_list_id: PERSONAL_DONE_LIST_ID },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { default_done_list_id: SOURCE_DONE_LIST_ID },
        error: null,
      });
    mocks.targetListMaybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: terminalListRow({
          boardId: PERSONAL_BOARD_ID,
          listId: PERSONAL_DONE_LIST_ID,
          name: 'Personal Done',
          status: 'done',
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: terminalListRow({
          boardId: SOURCE_BOARD_ID,
          listId: SOURCE_DONE_LIST_ID,
          name: 'Done',
          status: 'done',
        }),
        error: null,
      });
    mocks.adminRpc.mockImplementation((name: string) => {
      if (name === 'update_task_with_relations') {
        return {
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: TASK_ID },
            error: null,
          }),
        };
      }

      return Promise.resolve({
        data: [
          {
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: PERSONAL_DONE_LIST_ID,
            personal_sort_key: null,
            personal_added_at: '2026-05-06T01:00:00.000Z',
            personal_placed_at: '2026-05-06T02:00:00.000Z',
          },
        ],
        error: null,
      });
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: SOURCE_DONE_LIST_ID,
            terminal_status: 'done',
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(
      1,
      'update_task_with_relations',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_task_id: TASK_ID,
        p_task_updates: expect.objectContaining({
          completed: true,
          completed_at: expect.any(String),
          closed_at: expect.any(String),
          list_id: SOURCE_DONE_LIST_ID,
        }),
      })
    );
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(
      2,
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: PERSONAL_DONE_LIST_ID,
      })
    );
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        completed_at: '2026-05-06T03:00:00.000Z',
        closed_at: '2026-05-06T03:00:00.000Z',
        list_id: PERSONAL_DONE_LIST_ID,
        personal_list_id: PERSONAL_DONE_LIST_ID,
        source_list_id: SOURCE_DONE_LIST_ID,
        source_list_name: 'Done',
        source_list_status: 'done',
      })
    );
  });

  it('falls back to the first matching closed lists when terminal defaults are unset', async () => {
    mocks.sourceTaskMaybeSingle
      .mockResolvedValueOnce({
        data: sourceTaskRow(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: sourceTaskRow({
          closedAt: '2026-05-06T04:00:00.000Z',
          completed: true,
          completedAt: null,
          listId: SOURCE_CLOSED_LIST_ID,
          listName: 'Closed',
          listStatus: 'closed',
        }),
        error: null,
      });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle
      .mockResolvedValueOnce({
        data: targetBoardRow(),
        error: null,
      })
      .mockResolvedValueOnce({
        data: { default_closed_list_id: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { default_closed_list_id: null },
        error: null,
      });
    mocks.taskListLimit
      .mockResolvedValueOnce({
        data: [
          terminalListRow({
            boardId: PERSONAL_BOARD_ID,
            listId: PERSONAL_CLOSED_LIST_ID,
            name: 'Personal Closed',
            status: 'closed',
          }),
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          terminalListRow({
            boardId: SOURCE_BOARD_ID,
            listId: SOURCE_CLOSED_LIST_ID,
            name: 'Closed',
            status: 'closed',
          }),
        ],
        error: null,
      });
    mocks.adminRpc.mockImplementation((name: string) => {
      if (name === 'update_task_with_relations') {
        return {
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: TASK_ID },
            error: null,
          }),
        };
      }

      return Promise.resolve({
        data: [
          {
            personal_board_id: PERSONAL_BOARD_ID,
            personal_list_id: PERSONAL_CLOSED_LIST_ID,
            personal_sort_key: null,
            personal_added_at: '2026-05-06T01:00:00.000Z',
            personal_placed_at: '2026-05-06T02:00:00.000Z',
          },
        ],
        error: null,
      });
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PERSONAL_BOARD_ID,
            terminal_status: 'closed',
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(
      1,
      'update_task_with_relations',
      expect.objectContaining({
        p_task_updates: expect.objectContaining({
          completed: true,
          completed_at: null,
          closed_at: expect.any(String),
          list_id: SOURCE_CLOSED_LIST_ID,
        }),
      })
    );
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(
      2,
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_list_id: PERSONAL_CLOSED_LIST_ID,
      })
    );
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        completed_at: null,
        closed_at: '2026-05-06T04:00:00.000Z',
        list_id: PERSONAL_CLOSED_LIST_ID,
        source_list_id: SOURCE_CLOSED_LIST_ID,
        source_list_status: 'closed',
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
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow(),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
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

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
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

  it('places an assignment-visible external task without source workspace membership', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: false, error: 'membership_missing' })
      .mockResolvedValueOnce({ ok: true });
    mocks.sourceAssignmentMaybeSingle.mockResolvedValue({
      data: { task_id: TASK_ID },
      error: null,
    });
    mocks.userOverrideMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow(),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
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

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.sourceAssignmentMaybeSingle).toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_task_id: TASK_ID,
        p_user_id: 'user-1',
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: PERSONAL_LIST_ID,
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
      data: targetBoardRow(),
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        'Only external workspace tasks or board-external personal tasks can be placed on a personal board',
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects non-personal destination boards', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetBoardMaybeSingle.mockResolvedValue({
      data: targetBoardRow({ personal: false }),
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Destination board must be personal',
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('resolves the personal board through the destination list for the production payload shape', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow({
        boardId: PRODUCTION_PERSONAL_BOARD_ID,
        listId: PRODUCTION_PERSONAL_LIST_ID,
      }),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
          personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
          personal_sort_key: 2_000_000,
          personal_added_at: '2026-07-06T01:00:00.000Z',
          personal_placed_at: '2026-07-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
            personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
            personal_sort_key: 2_000_000,
            previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
            next_task_id: null,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.targetBoardMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.resolveTaskBoardAccess).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
        p_personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
        p_personal_sort_key: 2_000_000,
        p_previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
        p_next_task_id: null,
      })
    );
  });

  it('uses destination personal workspace membership for the production payload', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, membershipType: 'MEMBER' });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow({
        boardId: PRODUCTION_PERSONAL_BOARD_ID,
        listId: PRODUCTION_PERSONAL_LIST_ID,
      }),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
          personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
          personal_sort_key: 2_000_000,
          personal_added_at: '2026-07-06T01:00:00.000Z',
          personal_placed_at: '2026-07-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
            personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
            personal_sort_key: 2_000_000,
            previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
            next_task_id: null,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenNthCalledWith(2, {
      requiredType: 'ANY',
      supabase: {},
      userId: 'user-1',
      wsId: PERSONAL_WS_ID,
    });
    expect(mocks.resolveTaskBoardAccess).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
        p_personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
        p_personal_sort_key: 2_000_000,
        p_previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
        p_next_task_id: null,
      })
    );
  });

  it('falls back to direct board edit access when target workspace membership is absent', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'membership_missing' });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow({
        boardId: PRODUCTION_PERSONAL_BOARD_ID,
        listId: PRODUCTION_PERSONAL_LIST_ID,
      }),
      error: null,
    });
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      access: { mode: 'member', permission: 'edit' },
      board: { id: PRODUCTION_PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
      boardId: PRODUCTION_PERSONAL_BOARD_ID,
      list: {
        board_id: PRODUCTION_PERSONAL_BOARD_ID,
        id: PRODUCTION_PERSONAL_LIST_ID,
      },
      listId: PRODUCTION_PERSONAL_LIST_ID,
      sbAdmin: mocks.adminClient,
      supabase: {},
      user: { id: 'user-1' },
      wsId: PERSONAL_WS_ID,
    });
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
          personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
          personal_sort_key: 2_000_000,
          personal_added_at: '2026-07-06T01:00:00.000Z',
          personal_placed_at: '2026-07-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
            personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
            personal_sort_key: 2_000_000,
            previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
            next_task_id: null,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: PRODUCTION_PERSONAL_BOARD_ID,
        listId: PRODUCTION_PERSONAL_LIST_ID,
        requiredPermission: 'edit',
        sbAdmin: mocks.adminClient,
        supabase: {},
        user: { id: 'user-1' },
        wsId: PERSONAL_WS_ID,
      })
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_board_id: PRODUCTION_PERSONAL_BOARD_ID,
        p_personal_list_id: PRODUCTION_PERSONAL_LIST_ID,
        p_personal_sort_key: 2_000_000,
        p_previous_task_id: PRODUCTION_PREVIOUS_TASK_ID,
        p_next_task_id: null,
      })
    );
  });

  it('returns personal board not found when destination board edit access is denied', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'membership_missing' });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow(),
      error: null,
    });
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Personal board not found',
    });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenNthCalledWith(2, {
      requiredType: 'ANY',
      supabase: {},
      userId: 'user-1',
      wsId: PERSONAL_WS_ID,
    });
    expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: PERSONAL_BOARD_ID,
        listId: PERSONAL_LIST_ID,
        requiredPermission: 'edit',
      })
    );
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('persists the list board when the supplied personal board id is stale', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow({
        boardId: PERSONAL_BOARD_ID,
        listId: PERSONAL_LIST_ID,
      }),
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: PERSONAL_LIST_ID,
          personal_sort_key: 2_000_000,
          personal_added_at: '2026-07-06T01:00:00.000Z',
          personal_placed_at: '2026-07-06T02:00:00.000Z',
        },
      ],
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
    const response = await (PUT as PlacementRouteHandler)(
      new NextRequest(
        `http://localhost/api/v1/users/me/tasks/${TASK_ID}/personal-placement`,
        {
          method: 'PUT',
          body: JSON.stringify({
            personal_board_id: STALE_PERSONAL_BOARD_ID,
            personal_list_id: PERSONAL_LIST_ID,
            personal_sort_key: 2_000_000,
          }),
        }
      ),
      {
        user: { id: 'user-1' },
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(200);
    expect(mocks.targetBoardMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'upsert_personal_task_placement',
      expect.objectContaining({
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_personal_list_id: PERSONAL_LIST_ID,
        p_personal_sort_key: 2_000_000,
      })
    );

    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        personal_board_id: PERSONAL_BOARD_ID,
        personal_list_id: PERSONAL_LIST_ID,
      })
    );
  });

  it('returns a server error when target workspace membership lookup fails', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        error: 'membership_lookup_failed',
      });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: targetListRow(),
      error: null,
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to verify destination access',
    });
    expect(mocks.resolveTaskBoardAccess).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('returns a server error when the personal list lookup fails', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.targetListMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const { PUT } = await import(
      '@/app/api/v1/users/me/tasks/[taskId]/personal-placement/route'
    );
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
        supabase: {},
      },
      { taskId: TASK_ID }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load personal list',
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
