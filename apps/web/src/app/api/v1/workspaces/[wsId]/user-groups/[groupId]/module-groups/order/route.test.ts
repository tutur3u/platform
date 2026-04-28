import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn();
  const membershipMaybeSingle = vi.fn();
  const groupMaybeSingle = vi.fn();
  const existingGroupsEq = vi.fn();
  const rpc = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: membershipMaybeSingle })),
        })),
      })),
    })),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: groupMaybeSingle })),
            })),
          })),
        };
      }
      if (table === 'workspace_course_module_groups') {
        return {
          select: vi.fn(() => ({
            eq: existingGroupsEq,
          })),
        };
      }
      return { select: vi.fn() };
    }),
    rpc,
  };

  return {
    adminSupabase,
    existingGroupsEq,
    groupMaybeSingle,
    membershipMaybeSingle,
    normalizeWorkspaceId,
    rpc,
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

describe('module group order route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });
    mocks.groupMaybeSingle.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.existingGroupsEq.mockResolvedValue({
      data: [
        { id: '33333333-3333-4333-8333-333333333333' },
        { id: '44444444-4444-4444-8444-444444444444' },
      ],
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('reorders module groups', async () => {
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/order/route'
    );

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/user-groups/${GROUP_ID}/module-groups/order`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            moduleGroupIds: [
              '44444444-4444-4444-8444-444444444444',
              '33333333-3333-4333-8333-333333333333',
            ],
          }),
        }
      ),
      { params: Promise.resolve({ wsId: 'ws-1', groupId: GROUP_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reorder_workspace_course_module_groups',
      {
        p_group_id: GROUP_ID,
        p_module_group_ids: [
          '44444444-4444-4444-8444-444444444444',
          '33333333-3333-4333-8333-333333333333',
        ],
      }
    );
  });
});
