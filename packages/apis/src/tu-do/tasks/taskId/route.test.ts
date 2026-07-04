import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const publishTaskRealtimeMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

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

vi.mock('../realtime-broadcast', () => ({
  publishTaskRealtime: (...args: Parameters<typeof publishTaskRealtimeMock>) =>
    publishTaskRealtimeMock(...args),
}));

import { handleTaskDetailRouteGET, handleTaskDetailRoutePUT } from './route';

describe('task detail route CLI app-session auth', () => {
  const taskId = '00000000-0000-4000-8000-000000000777';
  const workspaceId = '00000000-0000-4000-8000-000000000123';
  let adminSupabase!: TypedSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(workspaceId);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });

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
              workspace: {
                personal: false,
              },
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
      if (table === 'tasks') {
        return {
          select: vi.fn(() => taskQuery),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    adminSupabase = {
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({ data: 'PRO', error: null }),
    } as unknown as TypedSupabaseClient;
    createAdminClientMock.mockResolvedValue(adminSupabase);
  });

  it('loads personal tasks through a pre-authenticated CLI app-session context', async () => {
    const response = await handleTaskDetailRouteGET(
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
      },
      {
        appSession: true,
        supabase: adminSupabase,
        user: {
          aud: 'authenticated',
          email: 'agent@example.com',
          id: '00000000-0000-4000-8000-000000000999',
        } as SupabaseUser,
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
      taskWorkspacePersonal: false,
      taskWorkspaceTier: 'PRO',
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(normalizeWorkspaceIdMock).toHaveBeenCalledWith(
      'personal',
      adminSupabase
    );
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '00000000-0000-4000-8000-000000000999',
        wsId: workspaceId,
      })
    );
  });
});

describe('task detail route PUT assignee validation', () => {
  const boardGuestUserId = '00000000-0000-4000-8000-000000000303';
  const boardId = '00000000-0000-4000-8000-000000000456';
  const listId = '00000000-0000-4000-8000-000000000555';
  const outsideUserId = '00000000-0000-4000-8000-000000000404';
  const taskId = '00000000-0000-4000-8000-000000000777';
  const workspaceId = '00000000-0000-4000-8000-000000000123';
  const workspaceMemberUserId = '00000000-0000-4000-8000-000000000202';
  let adminSupabase!: TypedSupabaseClient;
  let updateTaskPayload: unknown;

  function buildTaskRecord(assigneeIds: string[] = []) {
    return {
      id: taskId,
      display_number: 123,
      name: 'Setup task board',
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
      list_id: listId,
      task_lists: {
        id: listId,
        name: 'To Do',
        status: 'active',
        board_id: boardId,
        workspace_boards: {
          id: boardId,
          name: 'Tasks',
          workspace: {
            personal: false,
          },
          ws_id: workspaceId,
        },
      },
      assignees: assigneeIds.map((id) => ({
        avatar_url: null,
        display_name: id === boardGuestUserId ? 'Board Guest' : 'Member',
        id,
      })),
      labels: [],
      projects: [],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(workspaceId);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    updateTaskPayload = undefined;

    const taskRows = [
      buildTaskRecord(),
      buildTaskRecord([workspaceMemberUserId, boardGuestUserId]),
    ];
    const tasksQuery = {
      eq: vi.fn(() => tasksQuery),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: taskRows.shift() ?? null, error: null })
      ),
    };
    const workspaceMembersQuery = {
      eq: vi.fn(() => workspaceMembersQuery),
      in: vi.fn(() =>
        Promise.resolve({
          data: [{ user_id: workspaceMemberUserId }],
          error: null,
        })
      ),
    };
    const boardSharesQuery = {
      eq: vi.fn(() => boardSharesQuery),
      in: vi.fn(() =>
        Promise.resolve({
          data: [{ shared_with_user_id: boardGuestUserId }],
          error: null,
        })
      ),
    };
    const fromMock = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => tasksQuery),
        };
      }

      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => workspaceMembersQuery),
        };
      }

      if (table === 'task_board_shares') {
        return {
          select: vi.fn(() => boardSharesQuery),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
    const rpcMock = vi.fn((rpcName: string, payload: unknown) => {
      if (rpcName !== 'update_task_with_relations') {
        throw new Error(`Unexpected rpc: ${rpcName}`);
      }

      updateTaskPayload = payload;

      return {
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data: { id: taskId, list_id: listId },
            error: null,
          })
        ),
      };
    });
    adminSupabase = {
      from: fromMock,
      rpc: rpcMock,
    } as unknown as TypedSupabaseClient;

    createAdminClientMock.mockResolvedValue(adminSupabase);
  });

  it('keeps direct board guests as valid task assignees', async () => {
    const response = await handleTaskDetailRoutePUT(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks/${taskId}`,
        {
          body: JSON.stringify({
            assignee_ids: [
              workspaceMemberUserId,
              boardGuestUserId,
              outsideUserId,
            ],
          }),
          headers: {
            'content-type': 'application/json',
          },
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          taskId,
          wsId: 'personal',
        }),
      },
      {
        supabase: adminSupabase!,
        user: {
          aud: 'authenticated',
          email: 'owner@example.com',
          id: '00000000-0000-4000-8000-000000000999',
        } as SupabaseUser,
      }
    );

    expect(response.status).toBe(200);
    expect(updateTaskPayload).toMatchObject({
      p_assignee_ids: [workspaceMemberUserId, boardGuestUserId],
      p_replace_assignees: true,
      p_task_id: taskId,
    });
    await expect(response.json()).resolves.toMatchObject({
      task: {
        assignee_ids: [workspaceMemberUserId, boardGuestUserId],
        id: taskId,
      },
    });
    expect(publishTaskRealtimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'task:upsert',
        taskIds: [taskId],
      })
    );
  });
});
