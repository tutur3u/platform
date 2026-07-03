import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  applyAttendanceMemberCounts: vi.fn(),
  createAdminClient: vi.fn(),
  fetchManagersForGroups: vi.fn(),
  getPermissions: vi.fn(),
  getShouldCountManagersInAttendance: vi.fn(),
  listUserGroupsForTable: vi.fn(),
  countUserGroupsForTable: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@/app/[locale]/(dashboard)/[wsId]/users/groups/utils', () => ({
  applyAttendanceMemberCounts: (
    ...args: Parameters<typeof mocks.applyAttendanceMemberCounts>
  ) => mocks.applyAttendanceMemberCounts(...args),
  fetchManagersForGroups: (
    ...args: Parameters<typeof mocks.fetchManagersForGroups>
  ) => mocks.fetchManagersForGroups(...args),
  getShouldCountManagersInAttendance: (
    ...args: Parameters<typeof mocks.getShouldCountManagersInAttendance>
  ) => mocks.getShouldCountManagersInAttendance(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/user-groups/table-repository', () => ({
  countUserGroupsForTable: (
    ...args: Parameters<typeof mocks.countUserGroupsForTable>
  ) => mocks.countUserGroupsForTable(...args),
  listUserGroupsForTable: (
    ...args: Parameters<typeof mocks.listUserGroupsForTable>
  ) => mocks.listUserGroupsForTable(...args),
}));

type QueryResult = {
  count?: number | null;
  data: unknown;
  error: null;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  });

  return query as typeof query & PromiseLike<QueryResult>;
}

function createAdminMock(resultsByTable: Record<string, QueryResult[]>) {
  const queries: Array<{
    query: ReturnType<typeof createQuery>;
    table: string;
  }> = [];
  const admin = {
    from: vi.fn((table: string) => {
      const result = resultsByTable[table]?.shift();

      if (!result) {
        throw new Error(`Unexpected Supabase table query: ${table}`);
      }

      const query = createQuery(result);
      queries.push({ query, table });
      return query;
    }),
  };

  return { admin, queries };
}

function permissions(permissionIds: string[]) {
  const permissionSet = new Set(permissionIds);

  return {
    containsPermission: vi.fn((permission: string) =>
      permissionSet.has(permission)
    ),
    permissions: permissionIds,
    withoutPermission: vi.fn(
      (permission: string) => !permissionSet.has(permission)
    ),
  };
}

describe('workspace user groups route app-session auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { from: vi.fn() },
      user: { email: 'teacher@example.com', id: 'teacher-1' },
    });
    mocks.fetchManagersForGroups.mockResolvedValue({});
    mocks.getShouldCountManagersInAttendance.mockResolvedValue(false);
    mocks.applyAttendanceMemberCounts.mockImplementation((groups) => groups);
    mocks.listUserGroupsForTable.mockResolvedValue([
      {
        archived: false,
        id: 'group-1',
        name: 'Physics',
        ws_id: 'ws-1',
      },
    ]);
    mocks.countUserGroupsForTable.mockResolvedValue(1);
  });

  it('resolves the forwarded Teach app-session before listing groups', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissions(['view_user_groups', 'manage_users'])
    );
    const { admin } = createAdminMock({});
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/groups?page=1&pageSize=8'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [{ id: 'group-1', name: 'Physics' }],
    });
    expect(response.status).toBe(200);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: true,
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: expect.objectContaining({ id: 'teacher-1' }),
      wsId: 'ws-1',
    });
    expect(mocks.listUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: null,
      client: admin,
      groupIds: null,
      page: 1,
      pageSize: 8,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
    expect(mocks.countUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: null,
      client: admin,
      groupIds: null,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
  });

  it('filters non-manager group lists with the linked workspace user id', async () => {
    mocks.getPermissions.mockResolvedValue(permissions(['view_user_groups']));
    const { admin, queries } = createAdminMock({
      workspace_user_groups_users: [
        {
          data: [{ group_id: 'group-1' }],
          error: null,
        },
      ],
      workspace_user_linked_users: [
        {
          data: { virtual_user_id: 'virtual-user-1' },
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/groups'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [{ id: 'group-1', name: 'Physics' }],
    });
    expect(response.status).toBe(200);

    const membershipsQuery = queries.find(
      (entry) => entry.table === 'workspace_user_groups_users'
    )?.query;

    expect(membershipsQuery?.in).toHaveBeenCalledWith('user_id', [
      'virtual-user-1',
      'teacher-1',
    ]);
    expect(mocks.listUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: ['group-1'],
      client: admin,
      groupIds: null,
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
  });

  it('keeps non-manager requested ids constrained to accessible group memberships', async () => {
    mocks.getPermissions.mockResolvedValue(permissions(['view_user_groups']));
    const { admin } = createAdminMock({
      workspace_user_groups_users: [
        {
          data: [{ group_id: 'group-1' }],
          error: null,
        },
      ],
      workspace_user_linked_users: [
        {
          data: { virtual_user_id: 'virtual-user-1' },
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/groups?ids=group-2,group-3'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: ['group-1'],
      client: admin,
      groupIds: ['group-2', 'group-3'],
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
    expect(mocks.countUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: ['group-1'],
      client: admin,
      groupIds: ['group-2', 'group-3'],
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
  });

  it('keeps non-manager userId lookups constrained to accessible group memberships', async () => {
    mocks.getPermissions.mockResolvedValue(permissions(['view_user_groups']));
    const { admin, queries } = createAdminMock({
      workspace_user_groups_users: [
        {
          data: [{ group_id: 'group-1' }],
          error: null,
        },
        {
          data: [{ group_id: 'group-1' }, { group_id: 'group-2' }],
          error: null,
        },
      ],
      workspace_user_linked_users: [
        {
          data: { virtual_user_id: 'virtual-user-1' },
          error: null,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/groups?userId=00000000-0000-0000-0000-000000000123'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await response.json();

    expect(response.status).toBe(200);
    expect(
      queries
        .filter((entry) => entry.table === 'workspace_user_groups_users')
        .at(1)?.query.eq
    ).toHaveBeenCalledWith('user_id', '00000000-0000-0000-0000-000000000123');
    expect(mocks.listUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: ['group-1'],
      client: admin,
      groupIds: ['group-1', 'group-2'],
      page: 1,
      pageSize: 10,
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
    expect(mocks.countUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: ['group-1'],
      client: admin,
      groupIds: ['group-1', 'group-2'],
      q: undefined,
      status: 'active',
      wsId: 'ws-1',
    });
  });

  it('passes requested ids, search, archived status, and pagination to the private helper', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissions(['view_user_groups', 'manage_users'])
    );
    const { admin } = createAdminMock({});
    mocks.createAdminClient.mockResolvedValue(admin);

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/groups?ids=group-2,group-3&q=tuyet&status=archived&page=2&pageSize=25'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: null,
      client: admin,
      groupIds: ['group-2', 'group-3'],
      page: 2,
      pageSize: 25,
      q: 'tuyet',
      status: 'archived',
      wsId: 'ws-1',
    });
    expect(mocks.countUserGroupsForTable).toHaveBeenCalledWith({
      accessibleGroupIds: null,
      client: admin,
      groupIds: ['group-2', 'group-3'],
      q: 'tuyet',
      status: 'archived',
      wsId: 'ws-1',
    });
  });
});
