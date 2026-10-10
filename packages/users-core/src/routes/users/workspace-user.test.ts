import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  userGetMaybeSingle: vi.fn(),
  userGetSelect: vi.fn(),
  userGetEq: vi.fn(),
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
  handleGetWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest,
  type WorkspaceUserMutationActor,
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

describe('workspace user recipient read handler', () => {
  const request = new Request('https://contacts.example/api/user');
  const user = {
    id: 'user-1',
    full_name: 'Full name',
    display_name: 'Display',
    email: 'recipient@example.com',
    phone: 'private-phone',
    archived: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('normalized-workspace');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (p: string) => p === 'update_users',
    });
    mocks.userGetMaybeSingle.mockResolvedValue({ data: user, error: null });
    const query = {
      eq: mocks.userGetEq,
      maybeSingle: mocks.userGetMaybeSingle,
    };
    mocks.userGetEq.mockReturnValue(query);
    mocks.userGetSelect.mockReturnValue(query);
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('workspace_users');
        return { select: mocks.userGetSelect };
      }),
    });
  });

  async function read(
    params = context,
    readActor: WorkspaceUserMutationActor = actor
  ) {
    const response = await handleGetWorkspaceUserRequest(
      request,
      params,
      readActor
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    return response;
  }

  it('returns a single minimal object, scoped to normalized workspace and exact user', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: actor,
      wsId: 'normalized-workspace',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.userGetSelect).toHaveBeenCalledWith(
      'id, full_name, display_name, email'
    );
    expect(mocks.userGetEq.mock.calls).toEqual([
      ['ws_id', 'normalized-workspace'],
      ['id', 'user-1'],
    ]);
    expect(mocks.userGetMaybeSingle).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      id: 'user-1',
      full_name: 'Full name',
      display_name: 'Display',
      email: 'recipient@example.com',
    });
  });

  it('rejects missing actor before privileged data access', async () => {
    expect((await read(context, { id: '' })).status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    { userId: '', wsId: 'workspace-1' },
    { userId: 'user-1', wsId: ' ' },
  ])(
    'rejects invalid scope before permissions/admin access (%j)',
    async (params) => {
      expect((await read({ params: Promise.resolve(params) })).status).toBe(
        400
      );
      expect(mocks.getPermissions).not.toHaveBeenCalled();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('does not query privileged data for a nonmember', async () => {
    mocks.getPermissions.mockResolvedValue(null);
    expect((await read()).status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires update_users even when the actor can view users', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (p: string) => p === 'view_users',
    });
    expect((await read()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 404 for a user absent from the selected workspace', async () => {
    mocks.userGetMaybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await read();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(mocks.userGetEq).toHaveBeenCalledWith(
      'ws_id',
      'normalized-workspace'
    );
  });

  it('returns generic database errors without leaking private details', async () => {
    mocks.userGetMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'private database detail' },
    });
    const response = await read();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching workspace user',
    });
  });

  it('returns generic errors for thrown database failures', async () => {
    mocks.userGetMaybeSingle.mockRejectedValue(new Error('private failure'));
    expect((await read()).status).toBe(500);
  });

  it('preserves nullable recipient fields', async () => {
    mocks.userGetMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', full_name: null, display_name: null, email: null },
      error: null,
    });
    expect(await (await read()).json()).toEqual({
      id: 'user-1',
      full_name: null,
      display_name: null,
      email: null,
    });
  });
});
