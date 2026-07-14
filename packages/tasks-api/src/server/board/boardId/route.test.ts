import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const resolveAuthenticatedSessionUserMock = vi.fn();
const taskListMaybeSingleMock = vi.fn();
const updateEqBoardMock = vi.fn();
const updateEqWorkspaceMock = vi.fn();
const updateMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof resolveAuthenticatedSessionUserMock>
  ) => resolveAuthenticatedSessionUserMock(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
  ) => verifyWorkspaceMembershipTypeMock(...args),
}));

import { type BoardRouteAuthContext, handleBoardRoutePUT, PUT } from './route';

describe('task board boardId route PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({ from: vi.fn() });
    normalizeWorkspaceIdMock.mockResolvedValue('ws-1');
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: true,
      error: null,
    });

    taskListMaybeSingleMock.mockResolvedValue({
      data: { id: 'list-2' },
      error: null,
    });
    updateEqWorkspaceMock.mockResolvedValue({ error: null });
    updateEqBoardMock.mockReturnValue({ eq: updateEqWorkspaceMock });
    updateMock.mockReturnValue({ eq: updateEqBoardMock });
    createAdminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'workspace_boards') {
          return {
            update: updateMock,
          };
        }

        if (table === 'task_lists') {
          const taskListQuery = {
            eq: vi.fn(),
            maybeSingle: taskListMaybeSingleMock,
            select: vi.fn(),
          };
          taskListQuery.select.mockReturnValue(taskListQuery);
          taskListQuery.eq.mockReturnValue(taskListQuery);
          return taskListQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  it('fails visibly when a default-list-only update cannot be persisted', async () => {
    updateEqWorkspaceMock.mockResolvedValueOnce({
      error: {
        code: '42703',
        message: 'column workspace_boards.default_list_id does not exist',
      },
    });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            default_list_id: 'list-2',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message:
        'Default task list settings are not available until the database migration is applied',
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ default_list_id: 'list-2' });
  });

  it('keeps rollout fallback for mixed board updates when default_list_id is unavailable', async () => {
    updateEqWorkspaceMock
      .mockResolvedValueOnce({
        error: {
          code: '42703',
          message: 'column workspace_boards.default_list_id does not exist',
        },
      })
      .mockResolvedValueOnce({ error: null });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            default_list_id: 'list-2',
            name: 'Roadmap',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      default_list_id: 'list-2',
      name: 'Roadmap',
    });
    expect(updateMock).toHaveBeenNthCalledWith(2, { name: 'Roadmap' });
  });

  it('rejects a default list that does not belong to the board', async () => {
    taskListMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            default_list_id: 'list-from-another-board',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Default list does not belong to this board',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a done default list unless it belongs to the board with done status', async () => {
    taskListMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            default_done_list_id: 'list-with-wrong-status',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        'Default done list must belong to this board and use the done status',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates terminal default list ids when they validate against matching statuses', async () => {
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            default_done_list_id: 'done-list',
            default_closed_list_id: 'closed-list',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(taskListMaybeSingleMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith({
      default_done_list_id: 'done-list',
      default_closed_list_id: 'closed-list',
    });
  });

  it('returns a stable duplicate-name error when renaming to an existing board name', async () => {
    updateEqWorkspaceMock.mockResolvedValueOnce({
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_workspace_boards_unique_active_name"',
      },
    });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Roadmap',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'TASK_BOARD_NAME_EXISTS',
      error: 'A task board with this name already exists',
    });
  });

  it('maps mobile archive, restore, and soft-delete flags onto board metadata', async () => {
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            archived: true,
            deleted: true,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        archived_at: expect.any(String),
        deleted_at: expect.any(String),
      })
    );

    await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            archived: false,
            restore: true,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(updateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        archived_at: null,
        deleted_at: null,
      })
    );
  });

  it('accepts preauthenticated task app-session context for mobile board updates', async () => {
    const supabase = { from: vi.fn() };
    const authContext: BoardRouteAuthContext = {
      appSession: true,
      supabase: supabase as never,
      user: { id: 'user-1' } as never,
    };
    const response = await handleBoardRoutePUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Mobile Board',
          }),
          headers: {
            Authorization: 'Bearer ttr_app_access',
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      },
      authContext
    );

    expect(response.status).toBe(200);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ name: 'Mobile Board' });
  });
});
