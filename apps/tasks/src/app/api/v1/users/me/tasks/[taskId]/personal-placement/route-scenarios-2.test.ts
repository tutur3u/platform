import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  mocks,
  PERSONAL_BOARD_ID,
  PERSONAL_LIST_ID,
  PERSONAL_WS_ID,
  type PlacementRouteHandler,
  PRODUCTION_PERSONAL_BOARD_ID,
  PRODUCTION_PERSONAL_LIST_ID,
  PRODUCTION_PREVIOUS_TASK_ID,
  SOURCE_BOARD_ID,
  SOURCE_WS_ID,
  sourceTaskRow,
  TASK_ID,
  targetBoardRow,
  targetListRow,
} from './placement-test-fixture';

describe('current-user task personal-placement route', () => {
  it('places a board-shared external task without source workspace membership', async () => {
    mocks.sourceTaskMaybeSingle.mockResolvedValue({
      data: sourceTaskRow(),
      error: null,
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: false, error: 'membership_missing' })
      .mockResolvedValueOnce({ ok: true });
    mocks.resolveTaskBoardAccess.mockResolvedValueOnce({
      access: { mode: 'guest', permission: 'view' },
      board: { id: SOURCE_BOARD_ID, ws_id: SOURCE_WS_ID },
      boardId: SOURCE_BOARD_ID,
      sbAdmin: mocks.adminClient,
      supabase: {},
      taskId: TASK_ID,
      user: { id: 'user-1' },
      wsId: SOURCE_WS_ID,
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
    expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredPermission: 'view',
        taskId: TASK_ID,
        wsId: SOURCE_WS_ID,
      })
    );
    expect(mocks.sourceAssignmentMaybeSingle).not.toHaveBeenCalled();
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

  it.each([
    ['an override row', { terminal_status: undefined }, 'view'],
    ['a stale assignment', { terminal_status: 'done' }, 'edit'],
  ])(
    'rejects a non-member whose only link to the task is %s',
    async (_label, extraBody, requiredPermission) => {
      mocks.sourceTaskMaybeSingle.mockResolvedValue({
        data: sourceTaskRow(),
        error: null,
      });
      mocks.verifyWorkspaceMembershipType.mockResolvedValue({
        ok: false,
        error: 'membership_missing',
      });
      mocks.sourceAssignmentMaybeSingle.mockResolvedValue({
        data: { task_id: TASK_ID },
        error: null,
      });
      mocks.userOverrideMaybeSingle.mockResolvedValue({
        data: { task_id: TASK_ID },
        error: null,
      });
      mocks.resolveTaskBoardAccess.mockResolvedValueOnce({
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
              ...extraBody,
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
      expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledWith(
        expect.objectContaining({ requiredPermission, taskId: TASK_ID })
      );
      expect(mocks.adminRpc).not.toHaveBeenCalled();
    }
  );

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
});
