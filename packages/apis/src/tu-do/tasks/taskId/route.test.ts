import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const getAppSessionTokenFromRequestMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const verifyCliAccessTokenMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: (
    ...args: Parameters<typeof getAppSessionTokenFromRequestMock>
  ) => getAppSessionTokenFromRequestMock(...args),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: (
    ...args: Parameters<typeof verifyCliAccessTokenMock>
  ) => verifyCliAccessTokenMock(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    normalizeWorkspaceId: (
      ...args: Parameters<typeof normalizeWorkspaceIdMock>
    ) => normalizeWorkspaceIdMock(...args),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
    ) => verifyWorkspaceMembershipTypeMock(...args),
  };
});

import { GET } from './route';

describe('task detail route CLI app-session auth', () => {
  const taskId = '00000000-0000-4000-8000-000000000777';
  const workspaceId = '00000000-0000-4000-8000-000000000123';

  beforeEach(() => {
    vi.clearAllMocks();

    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_access');
    verifyCliAccessTokenMock.mockReturnValue({
      claims: {
        email: 'agent@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });

    const personalWorkspaceQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: workspaceId },
        error: null,
      }),
    };
    personalWorkspaceQuery.eq.mockReturnValue(personalWorkspaceQuery);

    const taskQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: taskId,
          display_number: 123,
          name: 'Ensure finance operations work via Tuturuuu CLI',
          description: null,
          priority: null,
          completed: false,
          completed_at: null,
          start_date: null,
          end_date: null,
          estimation_points: null,
          sort_key: null,
          created_at: '2026-05-17T00:00:00.000Z',
          closed_at: null,
          deleted_at: null,
          list_id: '00000000-0000-4000-8000-000000000555',
          task_lists: {
            id: '00000000-0000-4000-8000-000000000555',
            name: 'In Progress',
            status: 'active',
            board_id: '00000000-0000-4000-8000-000000000456',
            workspace_boards: {
              id: '00000000-0000-4000-8000-000000000456',
              name: 'Tasks',
              ws_id: workspaceId,
            },
          },
          assignees: [],
          labels: [],
          projects: [],
        },
        error: null,
      }),
    };
    taskQuery.eq.mockReturnValue(taskQuery);

    const fromMock = vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => personalWorkspaceQuery),
        };
      }

      if (table === 'tasks') {
        return {
          select: vi.fn(() => taskQuery),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createAdminClientMock.mockResolvedValue({ from: fromMock });
  });

  it('loads personal tasks through a valid CLI app-session token', async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks/${taskId}`,
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        params: Promise.resolve({
          taskId,
          wsId: 'personal',
        }),
      }
    );

    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      task: {
        id: taskId,
        name: 'Ensure finance operations work via Tuturuuu CLI',
        board_name: 'Tasks',
        list_name: 'In Progress',
      },
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '00000000-0000-4000-8000-000000000999',
        wsId: workspaceId,
      })
    );
  });
});
