import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  fetchRequireAttentionUserIds: vi.fn(),
  getPermissions: vi.fn(),
  hasUserGroupInWorkspace: vi.fn(),
  resolveUserGroupRouteWorkspaceId: vi.fn(),
  rpc: vi.fn(),
  serverLoggerError: vi.fn(),
  withRequireAttentionFlag: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@tuturuuu/users-core/lib/require-attention-users', () => ({
  fetchRequireAttentionUserIds: (
    ...args: Parameters<typeof mocks.fetchRequireAttentionUserIds>
  ) => mocks.fetchRequireAttentionUserIds(...args),
  withRequireAttentionFlag: (
    ...args: Parameters<typeof mocks.withRequireAttentionFlag>
  ) => mocks.withRequireAttentionFlag(...args),
}));

vi.mock('@/lib/user-groups/route-helpers', () => ({
  hasUserGroupInWorkspace: (
    ...args: Parameters<typeof mocks.hasUserGroupInWorkspace>
  ) => mocks.hasUserGroupInWorkspace(...args),
  resolveRequestActorAuthUid: vi.fn(),
  resolveUserGroupRouteWorkspaceId: (
    ...args: Parameters<typeof mocks.resolveUserGroupRouteWorkspaceId>
  ) => mocks.resolveUserGroupRouteWorkspaceId(...args),
}));

type QueryResult = {
  data: unknown;
  error: null;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    range: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => query),
  };

  return query;
}

function permissions(permissionIds: string[]) {
  const permissionSet = new Set(permissionIds);

  return {
    containsPermission: vi.fn((permission: string) =>
      permissionSet.has(permission)
    ),
    withoutPermission: vi.fn(
      (permission: string) => !permissionSet.has(permission)
    ),
  };
}

describe('workspace user group members route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveUserGroupRouteWorkspaceId.mockResolvedValue('ws-1');
    mocks.getPermissions.mockResolvedValue(
      permissions([
        'view_user_groups',
        'view_users_private_info',
        'view_users_public_info',
      ])
    );
    mocks.hasUserGroupInWorkspace.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.fetchRequireAttentionUserIds.mockResolvedValue([]);
    mocks.withRequireAttentionFlag.mockImplementation((members) => members);
  });

  it('uses the direct workspace user membership FK when listing members', async () => {
    const membersQuery = createQuery({
      data: [
        {
          role: 'STUDENT',
          workspace_users: {
            archived: false,
            archived_until: null,
            avatar_url: null,
            birthday: '2010-01-01',
            display_name: 'Learner',
            email: 'learner@example.com',
            full_name: 'Learner One',
            gender: 'female',
            id: '11111111-1111-4111-8111-111111111111',
            note: null,
            phone: '+84000000000',
          },
        },
      ],
      error: null,
    });
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table !== 'workspace_user_groups_users') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return membersQuery;
      }),
      rpc: mocks.rpc,
    };
    mocks.createAdminClient.mockResolvedValue(sbAdmin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/user-groups/group-1/members?offset=0&limit=10'
    );
    const response = await GET(request, {
      params: Promise.resolve({ groupId: 'group-1', wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          display_name: 'Learner',
          id: '11111111-1111-4111-8111-111111111111',
          isGuest: false,
          role: 'STUDENT',
        },
      ],
      count: 1,
    });
    expect(membersQuery.select).toHaveBeenCalledWith(
      'workspace_users!workspace_user_roles_users_user_id_fkey!inner(id, display_name, full_name, avatar_url, archived, archived_until, note, birthday, gender, email, phone), role',
      { count: 'exact' }
    );
    expect(membersQuery.eq).toHaveBeenCalledWith('group_id', 'group-1');
    expect(membersQuery.eq).toHaveBeenCalledWith(
      'workspace_users.ws_id',
      'ws-1'
    );
    expect(membersQuery.range).toHaveBeenCalledWith(0, 9);
    expect(mocks.fetchRequireAttentionUserIds).toHaveBeenCalledWith(sbAdmin, {
      groupId: 'group-1',
      userIds: ['11111111-1111-4111-8111-111111111111'],
      wsId: 'ws-1',
    });
  });
});
