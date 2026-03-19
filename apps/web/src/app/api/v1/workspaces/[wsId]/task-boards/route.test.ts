import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUserMock = vi.fn();
const workspaceMembersMaybeSingleMock = vi.fn();
const workspaceMembersEqMock = vi.fn();
const boardsOrderCreatedAtMock = vi.fn();
const boardsOrderNameMock = vi.fn();
const boardsEqMock = vi.fn();
const boardsSelectMock = vi.fn();
const taskListsEqMock = vi.fn();
const taskListsInMock = vi.fn();
const taskListsSelectMock = vi.fn();
const tasksIsMock = vi.fn();
const tasksInMock = vi.fn();
const tasksSelectMock = vi.fn();
const fromMock = vi.fn();
const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const getPermissionsMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
}));

import { GET } from './route';

describe('task boards route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-4000-8000-000000000123'
    );
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });

    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: '00000000-0000-4000-8000-000000000999',
        },
      },
      error: null,
    });

    workspaceMembersEqMock
      .mockReturnValueOnce({ eq: workspaceMembersEqMock })
      .mockReturnValueOnce({ maybeSingle: workspaceMembersMaybeSingleMock });
    workspaceMembersMaybeSingleMock.mockResolvedValue({
      data: { user_id: '00000000-0000-4000-8000-000000000999' },
      error: null,
    });

    boardsOrderCreatedAtMock.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    });
    boardsOrderNameMock.mockReturnValue({
      order: boardsOrderCreatedAtMock,
      range: vi.fn(),
    });
    boardsEqMock.mockReturnValue({
      order: boardsOrderNameMock,
    });
    boardsSelectMock.mockReturnValue({
      eq: boardsEqMock,
    });

    taskListsEqMock.mockResolvedValue({
      data: [],
      error: null,
    });
    taskListsInMock.mockReturnValue({
      eq: taskListsEqMock,
    });
    taskListsSelectMock.mockReturnValue({
      in: taskListsInMock,
    });

    tasksIsMock.mockResolvedValue({
      data: [],
      error: null,
    });
    tasksInMock.mockReturnValue({
      is: tasksIsMock,
    });
    tasksSelectMock.mockReturnValue({
      in: tasksInMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: workspaceMembersEqMock,
          }),
        };
      }

      if (table === 'workspace_boards') {
        return {
          select: boardsSelectMock,
        };
      }

      if (table === 'task_lists') {
        return {
          select: taskListsSelectMock,
        };
      }

      if (table === 'tasks') {
        return {
          select: tasksSelectMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock,
      },
      from: fromMock,
    });

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
    });
  });

  it('allows board listing for workspace members without manage_projects', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ boards: [], count: 0 });
    expect(getPermissionsMock).not.toHaveBeenCalled();
  });
});
