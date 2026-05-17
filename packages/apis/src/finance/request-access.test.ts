import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSupabase: { from: vi.fn() },
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  sessionSupabase: { from: vi.fn() },
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

describe('finance request access', () => {
  const permissions = {
    containsPermission: vi.fn(() => true),
    membershipType: 'MEMBER' as const,
    permissions: ['manage_finance'],
    withoutPermission: vi.fn(() => false),
    wsId: 'workspace-1',
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.createClient.mockResolvedValue(mocks.sessionSupabase);
    mocks.getPermissions.mockResolvedValue(permissions);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: {
        email: 'member@tuturuuu.com',
        id: 'user-1',
      },
    });
  });

  it('uses pre-authenticated finance route context with explicit permissions', async () => {
    const { getFinanceRouteContext } = await import('./request-access.js');
    const result = await getFinanceRouteContext(
      new Request('http://localhost/api/workspaces/personal/wallets', {
        headers: {
          Authorization: 'Bearer ttr_app_access',
        },
      }),
      'personal',
      {
        sbAdmin: mocks.adminSupabase as never,
        supabase: mocks.adminSupabase as never,
        user: {
          email: 'cli@tuturuuu.com',
          id: 'cli-user-1',
        } as never,
      }
    );

    expect(result.response).toBeUndefined();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'personal',
      user: {
        email: 'cli@tuturuuu.com',
        id: 'cli-user-1',
      },
    });
    expect(result.context).toEqual(
      expect.objectContaining({
        normalizedWsId: 'workspace-1',
        sbAdmin: mocks.adminSupabase,
        supabase: mocks.adminSupabase,
      })
    );
  });

  it('falls back to the request Supabase session when no CLI token is present', async () => {
    const { getFinanceRouteContext } = await import('./request-access.js');
    const result = await getFinanceRouteContext(
      new Request('http://localhost/api/workspaces/workspace-1/wallets'),
      'workspace-1'
    );

    expect(result.response).toBeUndefined();
    expect(mocks.createClient).toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalledWith();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      user: {
        email: 'member@tuturuuu.com',
        id: 'user-1',
      },
    });
    expect(result.context).toEqual(
      expect.objectContaining({
        normalizedWsId: 'workspace-1',
        sbAdmin: mocks.adminSupabase,
        supabase: mocks.sessionSupabase,
      })
    );
  });
});
