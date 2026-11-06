import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  mocks,
  PERSONAL_BOARD_ID,
  PERSONAL_LIST_ID,
  type PlacementRouteHandler,
  STALE_PERSONAL_BOARD_ID,
  sourceTaskRow,
  TASK_ID,
  targetListRow,
} from './placement-test-fixture';

describe('current-user task personal-placement route', () => {
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
