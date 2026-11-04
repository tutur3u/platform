import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import {
  mocks,
  NEXT_TASK_ID,
  PERSONAL_BOARD_ID,
  PERSONAL_CLOSED_LIST_ID,
  PERSONAL_DONE_LIST_ID,
  PERSONAL_LIST_ID,
  PERSONAL_SOURCE_BOARD_ID,
  PERSONAL_WS_ID,
  type PlacementRouteHandler,
  PREVIOUS_TASK_ID,
  SOURCE_BOARD_ID,
  SOURCE_CLOSED_LIST_ID,
  SOURCE_DONE_LIST_ID,
  SOURCE_WS_ID,
  sourceTaskRow,
  TASK_ID,
  targetBoardRow,
  targetListRow,
  terminalListRow,
} from './placement-test-fixture';

describe('current-user task personal-placement route', () => {
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
});
