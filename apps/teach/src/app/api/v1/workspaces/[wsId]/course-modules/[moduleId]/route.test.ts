import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '44444444-4444-4444-8444-444444444444';
const MODULE_GROUP_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => {
  const createQuery = () => {
    const query: any = {
      data: null,
      error: null,
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: query.data,
        error: query.error,
      })),
      select: vi.fn(() => query),
    };
    return query;
  };

  const containsPermission = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();
  const moduleLookupQuery = createQuery();
  const updateQuery = createQuery();
  const deleteQuery = createQuery();
  const update = vi.fn(() => updateQuery);
  const deleteModule = vi.fn(() => deleteQuery);

  const sessionSupabase = {};
  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_course_modules') {
        return {
          delete: deleteModule,
          select: vi.fn(() => moduleLookupQuery),
          update,
        };
      }

      return { select: vi.fn(() => createQuery()) };
    }),
  };

  return {
    adminSupabase,
    containsPermission,
    deleteModule,
    deleteQuery,
    moduleLookupQuery,
    normalizeWorkspaceId,
    sessionSupabase,
    update,
    updateQuery,
    verifyWorkspaceMembershipType,
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
        (await routeContext?.params) as { moduleId: string; wsId: string }
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
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

function createParams() {
  return {
    params: Promise.resolve({
      moduleId: MODULE_ID,
      wsId: WORKSPACE_ID,
    }),
  };
}

function createPutRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/course-modules/${MODULE_ID}`,
    {
      body: JSON.stringify({ name: 'Updated module' }),
      method: 'PUT',
    }
  );
}

function createDeleteRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/course-modules/${MODULE_ID}`,
    { method: 'DELETE' }
  );
}

describe('workspace course module route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.containsPermission.mockReturnValue(true);
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.moduleLookupQuery.data = {
      group_id: GROUP_ID,
      id: MODULE_ID,
      module_group_id: MODULE_GROUP_ID,
    };
    mocks.moduleLookupQuery.error = null;
    mocks.updateQuery.data = { id: MODULE_ID };
    mocks.updateQuery.error = null;
    mocks.deleteQuery.data = { id: MODULE_ID };
    mocks.deleteQuery.error = null;
  });

  it('rejects low-privilege workspace members before admin-backed update or delete', async () => {
    mocks.containsPermission.mockReturnValue(false);
    const { DELETE, PUT } = await import('./route');

    const putResponse = await PUT(createPutRequest(), createParams());
    const deleteResponse = await DELETE(createDeleteRequest(), createParams());

    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    await expect(putResponse.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    await expect(deleteResponse.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.containsPermission).toHaveBeenCalledWith('manage_users');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteModule).not.toHaveBeenCalled();
  });

  it('updates modules only after workspace-bound lookup and original group-bound mutation', async () => {
    const { PUT } = await import('./route');

    const response = await PUT(createPutRequest(), createParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.moduleLookupQuery.eq).toHaveBeenCalledWith('id', MODULE_ID);
    expect(mocks.moduleLookupQuery.eq).toHaveBeenCalledWith(
      'workspace_user_groups.ws_id',
      WORKSPACE_ID
    );
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Updated module' });
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith('id', MODULE_ID);
    expect(mocks.updateQuery.eq).toHaveBeenCalledWith('group_id', GROUP_ID);
  });

  it('deletes modules only after workspace-bound lookup and original group-bound mutation', async () => {
    const { DELETE } = await import('./route');

    const response = await DELETE(createDeleteRequest(), createParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.moduleLookupQuery.eq).toHaveBeenCalledWith('id', MODULE_ID);
    expect(mocks.moduleLookupQuery.eq).toHaveBeenCalledWith(
      'workspace_user_groups.ws_id',
      WORKSPACE_ID
    );
    expect(mocks.deleteModule).toHaveBeenCalled();
    expect(mocks.deleteQuery.eq).toHaveBeenCalledWith('id', MODULE_ID);
    expect(mocks.deleteQuery.eq).toHaveBeenCalledWith('group_id', GROUP_ID);
  });
});
