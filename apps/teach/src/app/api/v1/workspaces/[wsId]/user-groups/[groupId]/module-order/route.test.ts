import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => {
  const containsPermission = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();
  const groupMaybeSingle = vi.fn();
  const modulesEq = vi.fn();
  const rpc = vi.fn();
  const serverLoggerError = vi.fn();

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
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: groupMaybeSingle })),
            })),
          })),
        };
      }

      if (table === 'workspace_course_modules') {
        return {
          select: vi.fn(() => ({
            eq: modulesEq,
          })),
        };
      }

      return { select: vi.fn() };
    }),
    rpc,
  };

  return {
    adminSupabase,
    containsPermission,
    groupMaybeSingle,
    modulesEq,
    normalizeWorkspaceId,
    rpc,
    serverLoggerError,
    sessionSupabase,
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
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

function createRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/module-order`,
    {
      body: JSON.stringify({
        moduleIds: [
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
        ],
      }),
      method: 'PATCH',
    }
  );
}

function createParams() {
  return {
    params: Promise.resolve({
      groupId: GROUP_ID,
      wsId: WORKSPACE_ID,
    }),
  };
}

describe('legacy user group module order route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.containsPermission.mockReturnValue(true);
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.groupMaybeSingle.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.modulesEq.mockResolvedValue({
      data: [
        { id: '44444444-4444-4444-8444-444444444444' },
        { id: '55555555-5555-4555-8555-555555555555' },
      ],
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('rejects low-privilege workspace members before creating an admin client', async () => {
    mocks.containsPermission.mockReturnValueOnce(false);
    const { PATCH } = await import('./route');

    const response = await PATCH(createRequest(), createParams());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.containsPermission).toHaveBeenCalledWith('manage_users');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reorders modules for workspace members with manage_users permission', async () => {
    const { PATCH } = await import('./route');

    const response = await PATCH(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('reorder_workspace_course_modules', {
      p_group_id: GROUP_ID,
      p_module_ids: [
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
      ],
    });
  });
});
