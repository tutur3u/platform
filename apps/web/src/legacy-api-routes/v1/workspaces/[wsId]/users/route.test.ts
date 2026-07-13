import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const adminRpcMock = vi.fn();
const guestGroupUpsertMock = vi.fn();
const guestGroupsResultMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
}));

vi.mock('@/lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: vi.fn(),
}));

import { POST } from './route';

function createGuestGroupsQuery() {
  let eqCallCount = 0;
  const query = {
    eq: vi.fn(() => {
      eqCallCount += 1;
      return eqCallCount >= 2 ? guestGroupsResultMock() : query;
    }),
    select: vi.fn(() => query),
  };

  return query;
}

describe('workspace users create route audit actor forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'create_users',
    });
    normalizeWorkspaceIdMock.mockResolvedValue('ws-1');
    adminRpcMock.mockResolvedValue({
      data: {
        id: 'created-user-1',
      },
      error: null,
    });
    guestGroupsResultMock.mockResolvedValue({
      data: [{ id: 'guest-group-1' }],
      error: null,
    });
    guestGroupUpsertMock.mockResolvedValue({ error: null });

    createAdminClientMock.mockResolvedValue({
      rpc: adminRpcMock,
      from: (table: string) => {
        if (table === 'workspace_user_groups') {
          return createGuestGroupsQuery();
        }

        if (table === 'workspace_user_groups_users') {
          return {
            upsert: guestGroupUpsertMock,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
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

  it('creates users through an admin RPC that forwards actor_auth_uid', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users',
      {
        method: 'POST',
        body: JSON.stringify({
          full_name: 'Alice Example',
          email: 'alice@example.com',
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({
        wsId: 'ws-1',
      }),
    });

    expect(getPermissionsMock).toHaveBeenCalledWith({
      request,
      user: {
        id: 'actor-auth-1',
      },
      wsId: 'ws-1',
    });
    expect(createClientMock).toHaveBeenCalledWith(request);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'admin_create_workspace_user_with_audit_actor',
      {
        p_ws_id: 'ws-1',
        p_payload: {
          full_name: 'Alice Example',
          email: 'alice@example.com',
        },
        p_actor_auth_uid: 'actor-auth-1',
      }
    );
    expect(response.status).toBe(200);
  });

  it('links created guest users to all workspace guest groups', async () => {
    guestGroupsResultMock.mockResolvedValue({
      data: [{ id: 'guest-group-1' }, { id: 'guest-group-2' }],
      error: null,
    });
    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users',
      {
        method: 'POST',
        body: JSON.stringify({
          full_name: 'Alice Example',
          is_guest: true,
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({
        wsId: 'ws-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'admin_create_workspace_user_with_audit_actor',
      expect.objectContaining({
        p_payload: {
          full_name: 'Alice Example',
        },
      })
    );
    expect(guestGroupUpsertMock).toHaveBeenCalledWith(
      [
        { group_id: 'guest-group-1', user_id: 'created-user-1' },
        { group_id: 'guest-group-2', user_id: 'created-user-1' },
      ],
      {
        ignoreDuplicates: true,
        onConflict: 'group_id,user_id',
      }
    );
    await expect(response.json()).resolves.toEqual({
      message: 'success',
    });
  });
});
