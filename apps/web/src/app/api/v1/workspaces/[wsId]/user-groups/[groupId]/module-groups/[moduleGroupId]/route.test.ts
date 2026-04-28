import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_GROUP_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn();
  const existingMaybeSingle = vi.fn();
  const updateEq = vi.fn();
  const deleteEq = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn(() => ({ select: vi.fn() })),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_course_module_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: existingMaybeSingle })),
            })),
          })),
          update: vi.fn(() => ({ eq: updateEq })),
          delete: vi.fn(() => ({ eq: deleteEq })),
        };
      }
      return { select: vi.fn() };
    }),
  };

  return {
    adminSupabase,
    deleteEq,
    existingMaybeSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    updateEq,
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
        (await routeContext?.params) as {
          groupId: string;
          moduleGroupId: string;
          wsId: string;
        }
      ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: vi.fn(async () => ({ containsPermission: () => true })),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
    verifyWorkspaceMembershipType: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

describe('module group item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.existingMaybeSingle.mockResolvedValue({
      data: { id: MODULE_GROUP_ID },
      error: null,
    });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
  });

  it('updates module group', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/route'
    );

    const response = await PUT(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/user-groups/${GROUP_ID}/module-groups/${MODULE_GROUP_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({ title: 'Renamed', color: '#AABBCC' }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          groupId: GROUP_ID,
          moduleGroupId: MODULE_GROUP_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
  });

  it('deletes module group', async () => {
    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/user-groups/${GROUP_ID}/module-groups/${MODULE_GROUP_ID}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          groupId: GROUP_ID,
          moduleGroupId: MODULE_GROUP_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
  });
});
