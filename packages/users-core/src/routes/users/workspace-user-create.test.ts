import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  syncWorkspaceUserGuestMembership: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('../../lib/user-groups/guest-membership', () => ({
  syncWorkspaceUserGuestMembership: mocks.syncWorkspaceUserGuestMembership,
}));

import { handleCreateWorkspaceUserRequest } from './workspace-user-create';

const actor = { email: 'manager@example.com', id: 'actor-1' };
const context = {
  params: Promise.resolve({ wsId: 'personal' }),
};

describe('workspace user create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'create_users',
    });
    mocks.adminRpc.mockResolvedValue({
      data: { id: 'created-user-1' },
      error: null,
    });
    mocks.syncWorkspaceUserGuestMembership.mockResolvedValue(undefined);
    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.adminRpc });
  });

  it('creates a non-guest user with normalized workspace and audit actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users',
      {
        body: JSON.stringify({
          email: 'alice@example.com',
          full_name: 'Alice Example',
        }),
        method: 'POST',
      }
    );

    const response = await handleCreateWorkspaceUserRequest(
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
      'admin_create_workspace_user_with_audit_actor',
      {
        p_actor_auth_uid: 'actor-1',
        p_payload: {
          email: 'alice@example.com',
          full_name: 'Alice Example',
        },
        p_ws_id: 'workspace-1',
      }
    );
    expect(mocks.syncWorkspaceUserGuestMembership).not.toHaveBeenCalled();
  });

  it('links a created guest user to guest groups', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users',
      {
        body: JSON.stringify({ full_name: 'Guest User', is_guest: true }),
        method: 'POST',
      }
    );

    const response = await handleCreateWorkspaceUserRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(200);
    expect(mocks.syncWorkspaceUserGuestMembership).toHaveBeenCalledWith({
      isGuest: true,
      sbAdmin: expect.anything(),
      userId: 'created-user-1',
      warningMessages: {
        linkFailed: 'User created, but failed to link to guest group.',
        noGuestGroups:
          'User created, but no guest group found in this workspace.',
        resolveFailed:
          'User created, but no guest group found in this workspace.',
      },
      wsId: 'workspace-1',
    });
  });

  it('does not write when create permission is missing', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users',
      {
        body: JSON.stringify({ full_name: 'Alice Example' }),
        method: 'POST',
      }
    );

    const response = await handleCreateWorkspaceUserRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
