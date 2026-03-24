import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const memberMaybeSingle = vi.fn();
  const workspaceConfigsIn = vi.fn();
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn(() => Promise.resolve('normalized-ws'));

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: memberMaybeSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
    rpc: vi.fn(),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_configs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: workspaceConfigsIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    getPermissions,
    memberMaybeSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    workspaceConfigsIn,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

describe('workspace settings configs route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mocks.memberMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });

    mocks.workspaceConfigsIn.mockResolvedValue({
      data: [{ id: 'REPORT_CONFIG_A', value: 'enabled' }],
      error: null,
    });

    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => true),
    });
  });

  it('allows workspace members to read configs without manage permissions', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=REPORT_CONFIG_A,REPORT_CONFIG_B'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      REPORT_CONFIG_A: 'enabled',
      REPORT_CONFIG_B: null,
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('keeps config mutations guarded by manage_workspace_settings', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ENABLE_REPORT_APPROVAL: 'true' }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Insufficient permissions to manage workspace settings',
    });
    expect(mocks.getPermissions).toHaveBeenCalled();
  });
});
