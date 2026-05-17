import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSupabase: { from: vi.fn() },
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppSessionTokenFromRequest: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  sessionSupabase: { from: vi.fn() },
  verifyCliAccessToken: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionTokenFromRequest>
  ) => mocks.getAppSessionTokenFromRequest(...args),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: (
    ...args: Parameters<typeof mocks.verifyCliAccessToken>
  ) => mocks.verifyCliAccessToken(...args),
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

  it('resolves CLI app-session tokens with an admin client and explicit permissions', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue('ttr_app_access');
    mocks.verifyCliAccessToken.mockReturnValue({
      claims: {
        email: 'cli@tuturuuu.com',
        sub: 'cli-user-1',
      },
      ok: true,
    });

    const { getFinanceRouteContext } = await import('./request-access.js');
    const result = await getFinanceRouteContext(
      new Request('http://localhost/api/workspaces/personal/wallets', {
        headers: {
          Authorization: 'Bearer ttr_app_access',
        },
      }),
      'personal'
    );

    expect(result.response).toBeUndefined();
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
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
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);

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
