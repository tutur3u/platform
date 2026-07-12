import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceUserLinkForUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  syncWorkspaceUserGuestMembership: vi.fn(),
  workspaceUserSingle: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));

vi.mock('../../lib/user-groups/guest-membership', () => ({
  syncWorkspaceUserGuestMembership: mocks.syncWorkspaceUserGuestMembership,
}));

import {
  handleDeleteWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest,
} from './workspace-user';

const actor = { email: 'manager@example.com', id: 'actor-1' };
const context = {
  params: Promise.resolve({ userId: 'user-1', wsId: 'workspace-1' }),
};

describe('workspace user mutation handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'update_users' || permission === 'delete_users',
    });
    mocks.workspaceUserSingle.mockResolvedValue({
      data: { archived: false, archived_until: null },
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({ data: { id: 'user-1' }, error: null });
    mocks.syncWorkspaceUserGuestMembership.mockResolvedValue(undefined);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue(null);
    mocks.createAdminClient.mockResolvedValue({
      from: (table: string) => {
        if (table !== 'workspace_users') {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: mocks.workspaceUserSingle,
              }),
            }),
          }),
        };
      },
      rpc: mocks.adminRpc,
    });
  });

  it('updates the user and reconciles guest membership with the satellite actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      {
        method: 'PUT',
        body: JSON.stringify({ full_name: 'Alice Example', is_guest: false }),
      }
    );

    const response = await handleUpdateWorkspaceUserRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: actor,
      wsId: 'workspace-1',
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'admin_update_workspace_user_with_audit_actor',
      {
        p_actor_auth_uid: 'actor-1',
        p_payload: { full_name: 'Alice Example' },
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.syncWorkspaceUserGuestMembership).toHaveBeenCalledWith({
      isGuest: false,
      sbAdmin: expect.anything(),
      userId: 'user-1',
      wsId: 'workspace-1',
    });
    await expect(response.json()).resolves.toEqual({ message: 'success' });
  });

  it('does not touch protected data when update permission is missing', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      { method: 'PUT', body: JSON.stringify({ is_guest: true }) }
    );

    const response = await handleUpdateWorkspaceUserRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('deletes the user with the satellite actor as audit context', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      { method: 'DELETE' }
    );

    const response = await handleDeleteWorkspaceUserRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'admin_delete_workspace_user_with_audit_actor',
      {
        p_actor_auth_uid: 'actor-1',
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      }
    );
  });
});
