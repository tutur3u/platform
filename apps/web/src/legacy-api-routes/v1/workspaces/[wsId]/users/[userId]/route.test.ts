import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const getCurrentWorkspaceUserMock = vi.fn();
const getPermissionsMock = vi.fn();
const workspaceUsersSelectSingleMock = vi.fn();
const adminRpcMock = vi.fn();
const statusChangesInsertMock = vi.fn();
const cancelPendingPostEmailsForWorkspaceUserMock = vi.fn();
const privateRpcMock = vi.fn();
const schemaMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentWorkspaceUser: (
    ...args: Parameters<typeof getCurrentWorkspaceUserMock>
  ) => getCurrentWorkspaceUserMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: vi.fn(),
}));

vi.mock('@/lib/post-email-queue', () => ({
  POST_EMAIL_INACTIVE_RECIPIENT_REASON:
    'Recipient is archived or temporarily archived.',
  cancelPendingPostEmailsForWorkspaceUser: (
    ...args: Parameters<typeof cancelPendingPostEmailsForWorkspaceUserMock>
  ) => cancelPendingPostEmailsForWorkspaceUserMock(...args),
  isWorkspaceUserInactiveForPostEmail: (
    user: { archived?: boolean | null; archived_until?: string | null } | null
  ) => {
    if (!user) return true;
    if (user.archived === true) return true;
    if (!user.archived_until) return false;
    return Date.parse(user.archived_until) > Date.now();
  },
}));

import {
  DELETE,
  PUT,
} from '@/app/api/v1/workspaces/[wsId]/users/[userId]/route';

describe('workspace user write routes preserve audit actor context', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCurrentWorkspaceUserMock.mockResolvedValue(null);
    workspaceUsersSelectSingleMock.mockResolvedValue({
      data: {
        archived: true,
        archived_until: '2026-03-10T00:00:00.000Z',
      },
      error: null,
    });
    adminRpcMock.mockResolvedValue({
      data: {
        id: 'user-1',
      },
      error: null,
    });
    statusChangesInsertMock.mockResolvedValue({ error: null });
    cancelPendingPostEmailsForWorkspaceUserMock.mockResolvedValue(2);
    privateRpcMock.mockResolvedValue({ data: true, error: null });
    schemaMock.mockReturnValue({ rpc: privateRpcMock });

    createAdminClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table === 'workspace_users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: workspaceUsersSelectSingleMock,
                }),
              }),
            }),
          };
        }

        if (table === 'workspace_user_status_changes') {
          return {
            insert: statusChangesInsertMock,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
      rpc: adminRpcMock,
      schema: schemaMock,
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'actor-auth-1',
            },
          },
        }),
      },
    });
  });

  it('updates users through an admin RPC that forwards actor_auth_uid', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'update_users',
    });

    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1',
      {
        method: 'PUT',
        body: JSON.stringify({
          archived_until: '2026-03-20T00:00:00.000Z',
        }),
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({
        wsId: 'ws-1',
        userId: 'user-1',
      }),
    });

    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: 'ws-1',
      user: { id: 'actor-auth-1' },
    });
    expect(createClientMock).toHaveBeenCalledWith(request);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'admin_update_workspace_user_with_audit_actor',
      {
        p_ws_id: 'ws-1',
        p_user_id: 'user-1',
        p_payload: {
          archived_until: '2026-03-20T00:00:00.000Z',
        },
        p_actor_auth_uid: 'actor-auth-1',
      }
    );
    expect(response.status).toBe(200);
    expect(statusChangesInsertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      ws_id: 'ws-1',
      archived: true,
      archived_until: '2026-03-20T00:00:00.000Z',
      creator_id: null,
      actor_auth_uid: 'actor-auth-1',
      source: 'live',
    });
    expect(cancelPendingPostEmailsForWorkspaceUserMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: 'user-1',
        wsId: 'ws-1',
        reason: 'Recipient is archived or temporarily archived.',
      }
    );
  });

  it('uses verified actor scope for the removal of eligible guest memberships', async () => {
    workspaceUsersSelectSingleMock.mockResolvedValueOnce({
      data: {
        archived: false,
        archived_until: null,
      },
      error: null,
    });
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'update_users',
    });

    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1',
      {
        method: 'PUT',
        body: JSON.stringify({
          full_name: 'Alice Example',
          is_guest: false,
        }),
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({
        wsId: 'ws-1',
        userId: 'user-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'admin_update_workspace_user_with_audit_actor',
      expect.objectContaining({
        p_payload: {
          full_name: 'Alice Example',
        },
      })
    );
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(privateRpcMock).toHaveBeenCalledExactlyOnceWith(
      'admin_sync_guest_group_memberships',
      {
        p_actor_auth_uid: 'actor-auth-1',
        p_is_guest: false,
        p_user_id: 'user-1',
        p_ws_id: 'ws-1',
      }
    );
    await expect(response.json()).resolves.toEqual({
      message: 'success',
    });
  });

  it('deletes users through an admin RPC that forwards actor_auth_uid', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'delete_users',
    });

    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1',
      {
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({
        wsId: 'ws-1',
        userId: 'user-1',
      }),
    });

    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: 'ws-1',
      request,
    });
    expect(createClientMock).toHaveBeenCalledWith(request);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'admin_delete_workspace_user_with_audit_actor',
      {
        p_ws_id: 'ws-1',
        p_user_id: 'user-1',
        p_actor_auth_uid: 'actor-auth-1',
      }
    );
    expect(response.status).toBe(200);
  });
});
