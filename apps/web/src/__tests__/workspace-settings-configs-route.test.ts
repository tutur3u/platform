import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const memberMaybeSingle = vi.fn();
  const workspaceConfigsIn = vi.fn();
  const listWorkspaceDefaultIncludedGroupIds = vi.fn();
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn(() => Promise.resolve('normalized-ws'));
  const serverLogger = {
    error: vi.fn(),
  };

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
    listWorkspaceDefaultIncludedGroupIds,
    workspaceConfigsIn,
    serverLogger,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: mocks.getPermissions,
    normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  };
});

vi.mock('@/lib/workspace-default-included-groups', () => ({
  listWorkspaceDefaultIncludedGroupIds:
    mocks.listWorkspaceDefaultIncludedGroupIds,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
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
      data: { type: 'MEMBER' as const },
      error: null,
    });

    mocks.workspaceConfigsIn.mockResolvedValue({
      data: [{ id: 'REPORT_CONFIG_A', value: 'enabled' }],
      error: null,
    });
    mocks.listWorkspaceDefaultIncludedGroupIds.mockResolvedValue({
      data: ['group-1', 'group-2'],
    });

    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => false),
      withoutPermission: vi.fn(() => false),
    });
  });

  it('rejects workspace config reads without manage_workspace_settings', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      containsPermission: vi.fn(() => false),
      withoutPermission: vi.fn(() => true),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=REPORT_CONFIG_A,REPORT_CONFIG_B'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Insufficient permissions to read workspace settings',
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'normalized-ws',
      request: expect.any(NextRequest),
    });
    expect(mocks.workspaceConfigsIn).not.toHaveBeenCalled();
  });

  it('allows report viewers to read report render configs without settings permission', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      containsPermission: vi.fn(
        (permission: string) => permission === 'view_user_groups_reports'
      ),
      withoutPermission: vi.fn(() => true),
    });
    mocks.workspaceConfigsIn.mockResolvedValueOnce({
      data: [{ id: 'BRAND_NAME', value: 'Easy Language Center' }],
      error: null,
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=BRAND_NAME,REPORT_TITLE_PREFIX'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      BRAND_NAME: 'Easy Language Center',
      REPORT_TITLE_PREFIX: null,
    });
    expect(mocks.workspaceConfigsIn).toHaveBeenCalledWith('id', [
      'BRAND_NAME',
      'REPORT_TITLE_PREFIX',
    ]);
  });

  it('allows invoice creators to read invoice creation defaults without settings permission', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      containsPermission: vi.fn(
        (permission: string) => permission === 'create_invoices'
      ),
      withoutPermission: vi.fn(() => true),
    });
    mocks.workspaceConfigsIn.mockResolvedValueOnce({
      data: [
        { id: 'DEFAULT_CURRENCY', value: 'VND' },
        { id: 'default_wallet_id', value: 'wallet-1' },
      ],
      error: null,
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=default_wallet_id,DEFAULT_SUBSCRIPTION_CATEGORY_ID,DEFAULT_CURRENCY'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      DEFAULT_CURRENCY: 'VND',
      DEFAULT_SUBSCRIPTION_CATEGORY_ID: null,
      default_wallet_id: 'wallet-1',
    });
    expect(mocks.workspaceConfigsIn).toHaveBeenCalledWith('id', [
      'default_wallet_id',
      'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
      'DEFAULT_CURRENCY',
    ]);
  });

  it('allows settings managers to read configs', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
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
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'ws-1',
      mocks.sessionSupabase
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'normalized-ws',
      request: expect.any(NextRequest),
    });
  });

  it('includes dedicated default included groups in batch config reads', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=DATABASE_DEFAULT_INCLUDED_GROUPS,REPORT_CONFIG_A'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      DATABASE_DEFAULT_INCLUDED_GROUPS: 'group-1,group-2',
      REPORT_CONFIG_A: 'enabled',
    });
    expect(mocks.listWorkspaceDefaultIncludedGroupIds).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'normalized-ws'
    );
    expect(mocks.workspaceConfigsIn).toHaveBeenCalledWith('id', [
      'REPORT_CONFIG_A',
    ]);
  });

  it('returns 500 when workspace membership lookup fails in GET', async () => {
    mocks.memberMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'membership lookup failed' },
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(mocks.memberMaybeSingle).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to verify workspace membership',
    });
  });

  it('returns 403 in GET only when membership lookup succeeds with no row', async () => {
    mocks.memberMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(mocks.memberMaybeSingle).toHaveBeenCalled();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Workspace access denied',
    });
  });

  it('keeps config mutations guarded by manage_workspace_settings', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      containsPermission: vi.fn(() => false),
      withoutPermission: vi.fn(() => true),
    });

    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
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
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'ws-1',
      mocks.sessionSupabase
    );
    expect(mocks.getPermissions).toHaveBeenCalled();
  });

  it('returns 500 when workspace membership lookup fails in PUT', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => false),
      withoutPermission: vi.fn(() => false),
    });
    mocks.memberMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'membership lookup failed' },
    });

    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/settings/configs/route'
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

    expect(mocks.memberMaybeSingle).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to verify workspace membership',
    });
  });
});
