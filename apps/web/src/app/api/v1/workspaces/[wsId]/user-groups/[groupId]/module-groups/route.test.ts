import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => {
  const membershipMaybeSingle = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const groupMaybeSingle = vi.fn();
  const listGroupsOrder = vi.fn();
  const insertSingle = vi.fn();
  const selectMaybeSingle = vi.fn();
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
          eq: vi.fn(() => ({
            maybeSingle: membershipMaybeSingle,
          })),
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
              eq: vi.fn(() => ({
                maybeSingle: groupMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_course_module_groups') {
        return {
          select: vi.fn((columns?: string) => {
            if (columns === 'sort_key') {
              return {
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: selectMaybeSingle,
                    })),
                  })),
                })),
              };
            }

            return {
              eq: vi.fn(() => ({ order: listGroupsOrder })),
              order: listGroupsOrder,
            };
          }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertSingle,
            })),
          })),
        };
      }

      return { select: vi.fn() };
    }),
    rpc,
  };

  return {
    adminSupabase,
    groupMaybeSingle,
    insertSingle,
    listGroupsOrder,
    membershipMaybeSingle,
    normalizeWorkspaceId,
    rpc,
    selectMaybeSingle,
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
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { groupId: string; wsId: string }
        ) => Promise<Response>
      )(
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
      containsPermission: () => true,
    })),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

describe('module groups route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    mocks.groupMaybeSingle.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.listGroupsOrder.mockResolvedValue({
      data: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          group_id: GROUP_ID,
          title: 'General',
          sort_key: 1,
        },
      ],
      error: null,
    });
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { sort_key: 1 },
      error: null,
    });
    mocks.insertSingle.mockResolvedValue({
      data: {
        id: '44444444-4444-4444-8444-444444444444',
        group_id: GROUP_ID,
        title: 'New Group',
        sort_key: 2,
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('lists module groups ordered by sort_key', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/route'
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/user-groups/${GROUP_ID}/module-groups`,
        { method: 'GET' }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', groupId: GROUP_ID }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        group_id: GROUP_ID,
        title: 'General',
        sort_key: 1,
      },
    ]);
  });

  it('creates a module group with next sort_key', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/route'
    );

    const response = await POST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/user-groups/${GROUP_ID}/module-groups`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: 'New Group',
            color: '#ff0000',
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', groupId: GROUP_ID }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      group_id: GROUP_ID,
      title: 'New Group',
      sort_key: 2,
    });
  });
});
