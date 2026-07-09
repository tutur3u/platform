import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_GROUP_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => {
  const createQuery = () => {
    const query: any = {
      data: null,
      error: null,
      eq: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: query.data,
        error: query.error,
      })),
      order: vi.fn(() => query),
    };
    return query;
  };

  const containsPermission = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const membershipQuery = createQuery();
  const groupQuery = createQuery();
  const modulesListQuery = createQuery();

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => membershipQuery),
        };
      }
      return { select: vi.fn(() => createQuery()) };
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => groupQuery),
        };
      }

      if (table === 'workspace_course_modules') {
        return {
          select: vi.fn(() => modulesListQuery),
        };
      }

      return { select: vi.fn(() => createQuery()) };
    }),
  };

  return {
    adminSupabase,
    containsPermission,
    groupQuery,
    membershipQuery,
    modulesListQuery,
    normalizeWorkspaceId,
    sessionSupabase,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (handler as any)(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { groupId: string; wsId: string }
      ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();

  return {
    ...actual,
    getPermissions: vi.fn(async () => ({
      containsPermission: mocks.containsPermission,
    })),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

function createParams() {
  return {
    params: Promise.resolve({
      groupId: GROUP_ID,
      wsId: WORKSPACE_ID,
    }),
  };
}

function createPostRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/modules`,
    {
      body: JSON.stringify({
        module_group_id: MODULE_GROUP_ID,
        name: 'Module title',
      }),
      method: 'POST',
    }
  );
}

describe('legacy user group modules route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.containsPermission.mockReturnValue(true);
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.membershipQuery.data = { user_id: 'user-1' };
    mocks.membershipQuery.error = null;
    mocks.groupQuery.data = { id: GROUP_ID };
    mocks.groupQuery.error = null;
    mocks.modulesListQuery.data = [
      { group_id: GROUP_ID, id: '44444444-4444-4444-8444-444444444444' },
    ];
    mocks.modulesListQuery.error = null;
  });

  it('rejects low-privilege workspace members before admin-backed list or create', async () => {
    mocks.containsPermission.mockReturnValue(false);
    const { GET, POST } = await import('./route');

    const getResponse = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/modules`
      ),
      createParams()
    );
    const postResponse = await POST(createPostRequest(), createParams());

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    await expect(getResponse.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    await expect(postResponse.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.containsPermission).toHaveBeenCalledWith('manage_users');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
  });

  it('lists modules only after validating the group belongs to the workspace', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/modules`
      ),
      createParams()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mocks.modulesListQuery.data);
    expect(mocks.groupQuery.eq).toHaveBeenCalledWith('id', GROUP_ID);
    expect(mocks.groupQuery.eq).toHaveBeenCalledWith('ws_id', WORKSPACE_ID);
    expect(mocks.modulesListQuery.eq).toHaveBeenCalledWith(
      'group_id',
      GROUP_ID
    );
  });
});
