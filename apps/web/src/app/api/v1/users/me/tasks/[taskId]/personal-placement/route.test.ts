import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_WS_ID = '22222222-2222-4222-8222-222222222222';
const PERSONAL_WS_ID = '33333333-3333-4333-8333-333333333333';
const PERSONAL_BOARD_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => {
  const sourceTaskMaybeSingle = vi.fn();
  const targetBoardMaybeSingle = vi.fn();
  const existingPlacementMaybeSingle = vi.fn();
  const savedPlacementSingle = vi.fn();
  const upsertPlacement = vi.fn(() => ({
    select: vi.fn(() => ({
      single: savedPlacementSingle,
    })),
  }));

  const overridesEqUser = vi.fn(() => ({
    maybeSingle: existingPlacementMaybeSingle,
  }));
  const overridesEqTask = vi.fn(() => ({
    eq: overridesEqUser,
  }));
  const overridesSelect = vi.fn(() => ({
    eq: overridesEqTask,
  }));

  const adminClient = {
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

      if (table === 'task_user_overrides') {
        return {
          select: overridesSelect,
          upsert: upsertPlacement,
        };
      }

      return {};
    }),
  };

  const verifyWorkspaceMembershipType = vi.fn();

  return {
    adminClient,
    existingPlacementMaybeSingle,
    savedPlacementSingle,
    sourceTaskMaybeSingle,
    targetBoardMaybeSingle,
    upsertPlacement,
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

function sourceTaskRow() {
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
      board_id: '66666666-6666-4666-8666-666666666666',
      workspace_boards: {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Source Board',
        ticket_prefix: 'SRC',
        ws_id: SOURCE_WS_ID,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: SOURCE_WS_ID,
          name: 'Source Workspace',
          personal: false,
        },
      },
    },
  };
}

describe('current-user task personal-placement route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.adminClient.from.mockClear();
    mocks.sourceTaskMaybeSingle.mockReset();
    mocks.targetBoardMaybeSingle.mockReset();
    mocks.existingPlacementMaybeSingle.mockReset();
    mocks.savedPlacementSingle.mockReset();
    mocks.upsertPlacement.mockClear();
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
    mocks.existingPlacementMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.savedPlacementSingle.mockResolvedValue({
      data: {
        personal_board_id: PERSONAL_BOARD_ID,
        personal_list_id: null,
        personal_sort_key: null,
        personal_added_at: '2026-05-06T01:00:00.000Z',
        personal_placed_at: null,
      },
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
    expect(mocks.upsertPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: TASK_ID,
        user_id: 'user-1',
        personal_board_id: PERSONAL_BOARD_ID,
        personal_list_id: null,
        personal_sort_key: null,
      }),
      { onConflict: 'task_id,user_id' }
    );
    const payload = await response.json();
    expect(payload.task).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        is_personal_external: true,
        list_id: `personal-external-staging:${PERSONAL_BOARD_ID}`,
        source_board_id: '66666666-6666-4666-8666-666666666666',
        source_workspace_id: SOURCE_WS_ID,
      })
    );
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
    expect(mocks.upsertPlacement).not.toHaveBeenCalled();
  });
});
