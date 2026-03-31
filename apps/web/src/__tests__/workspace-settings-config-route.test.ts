import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const memberMaybeSingle = vi.fn();
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn(() => Promise.resolve('normalized-ws'));
  const listWorkspaceDefaultIncludedGroupIds = vi.fn();
  const replaceWorkspaceDefaultIncludedGroupIds = vi.fn();
  const getWorkspaceConfig = vi.fn();

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
  };

  const adminSupabase = {
    from: vi.fn(),
  };

  return {
    adminSupabase,
    getPermissions,
    getWorkspaceConfig,
    listWorkspaceDefaultIncludedGroupIds,
    memberMaybeSingle,
    normalizeWorkspaceId,
    replaceWorkspaceDefaultIncludedGroupIds,
    sessionSupabase,
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

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));

vi.mock('@/lib/workspace-default-included-groups', () => ({
  listWorkspaceDefaultIncludedGroupIds:
    mocks.listWorkspaceDefaultIncludedGroupIds,
  replaceWorkspaceDefaultIncludedGroupIds:
    mocks.replaceWorkspaceDefaultIncludedGroupIds,
}));

describe('workspace setting config route', () => {
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

    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });

    mocks.listWorkspaceDefaultIncludedGroupIds.mockResolvedValue({
      data: ['group-1', 'group-2'],
    });

    mocks.replaceWorkspaceDefaultIncludedGroupIds.mockResolvedValue({
      data: ['group-1', 'group-2'],
    });

    mocks.getWorkspaceConfig.mockResolvedValue('enabled');
  });

  it('reads default included groups from the dedicated store', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/[configId]/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/DATABASE_DEFAULT_INCLUDED_GROUPS'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          configId: 'DATABASE_DEFAULT_INCLUDED_GROUPS',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      value: 'group-1,group-2',
    });
    expect(mocks.listWorkspaceDefaultIncludedGroupIds).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'normalized-ws'
    );
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });

  it('writes default included groups through the dedicated store', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/[configId]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/DATABASE_DEFAULT_INCLUDED_GROUPS',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: 'group-1,group-2',
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          configId: 'DATABASE_DEFAULT_INCLUDED_GROUPS',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.replaceWorkspaceDefaultIncludedGroupIds).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'normalized-ws',
      'group-1,group-2'
    );
  });

  it('surfaces dedicated-store write errors', async () => {
    mocks.replaceWorkspaceDefaultIncludedGroupIds.mockResolvedValueOnce({
      data: [],
      errorMessage: 'Failed to save default included groups',
    });

    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/[configId]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/DATABASE_DEFAULT_INCLUDED_GROUPS',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: 'group-1,group-2',
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          configId: 'DATABASE_DEFAULT_INCLUDED_GROUPS',
        }),
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to save default included groups',
    });
  });
});
