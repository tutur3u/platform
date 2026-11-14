import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

describe('Infrastructure admin access', () => {
  const user = { email: 'admin@tuturuuu.com', id: 'user-1' };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(user);
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
  });

  it('rejects a root member without the requested infrastructure permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');

    const result = await authorizeInfrastructureAdminRequest(
      'manage_workspace_roles'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves access for root users with the requested permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_roles'
      ),
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');

    const result = await authorizeInfrastructureAdminRequest(
      'manage_workspace_roles'
    );

    expect(result.ok).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('accepts any matching permission when multiple permissions are allowed', async () => {
    mocks.getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_secrets'
      ),
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');

    const result = await authorizeInfrastructureAdminRequest([
      'manage_workspace_roles',
      'manage_workspace_secrets',
    ]);

    expect(result.ok).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('rejects non-root workspace owners', async () => {
    const targetPermissions = {
      membershipType: 'MEMBER',
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_secrets'
      ),
    };
    const rootPermissions = {
      membershipType: 'MEMBER',
      containsPermission: vi.fn().mockReturnValue(false),
    };
    mocks.getPermissions.mockImplementation(async ({ wsId }) =>
      wsId === ROOT_WORKSPACE_ID ? rootPermissions : targetPermissions
    );
    const { authorizeInfrastructureWorkspaceSecretsRequest } =
      await import('./infrastructure-admin-access');

    const result = await authorizeInfrastructureWorkspaceSecretsRequest();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it('rejects root workspace members without secret-management permissions', async () => {
    mocks.getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const { authorizeInfrastructureWorkspaceSecretsRequest } =
      await import('./infrastructure-admin-access');

    const result = await authorizeInfrastructureWorkspaceSecretsRequest();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
    'admits root MEMBER %s administrators under SR-385',
    async (rootPermission) => {
      const targetPermissions = {
        membershipType: 'MEMBER',
        containsPermission: vi.fn().mockReturnValue(false),
      };
      const rootPermissions = {
        membershipType: 'MEMBER',
        containsPermission: vi.fn(
          (permission: string) => permission === rootPermission
        ),
      };
      mocks.getPermissions.mockImplementation(async ({ wsId }) =>
        wsId === ROOT_WORKSPACE_ID ? rootPermissions : targetPermissions
      );
      const { authorizeInfrastructureWorkspaceSecretsRequest } =
        await import('./infrastructure-admin-access');

      const result = await authorizeInfrastructureWorkspaceSecretsRequest();

      expect(result.ok).toBe(true);
      expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    }
  );
});

describe('Infrastructure Bearer session authorization', () => {
  beforeEach(() => vi.resetAllMocks());
  it('checks the root permission for the verified Bearer actor', async () => {
    const user = { id: '11111111-1111-4111-8111-111111111111' };
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    mocks.createAdminClient.mockResolvedValue({ auth: { getUser } });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
      membershipType: 'MEMBER',
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');
    const result = await authorizeInfrastructureAdminRequest(
      'view_infrastructure',
      true,
      new Request('https://infrastructure.tuturuuu.com', {
        headers: { Authorization: 'Bearer fixture-session' },
      })
    );
    expect(result.ok).toBe(true);
    expect(getUser).toHaveBeenCalledWith('fixture-session');
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
  });
  it('denies a verified Bearer guest of the root workspace', async () => {
    const user = { id: '22222222-2222-4222-8222-222222222222' };
    mocks.createAdminClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
      membershipType: 'GUEST',
    });
    const { authorizeInfrastructureAdminRequest } =
      await import('./infrastructure-admin-access');
    const result = await authorizeInfrastructureAdminRequest(
      'view_infrastructure',
      true,
      new Request('https://infrastructure.tuturuuu.com', {
        headers: { Authorization: 'Bearer fixture-session' },
      })
    );
    expect(result.ok).toBe(false);
  });
  it.each(['Basic invalid', 'Bearer invalid'])(
    'never falls back from rejected %s to a cookie',
    async (authorization) => {
      mocks.createAdminClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { status: 401 },
          }),
        },
      });
      mocks.getSatelliteAppSessionUser.mockResolvedValue({
        id: 'cookie-actor',
      });
      const { authorizeInfrastructureAdminRequest } =
        await import('./infrastructure-admin-access');
      expect(
        (
          await authorizeInfrastructureAdminRequest(
            'view_infrastructure',
            true,
            new Request('https://infrastructure.tuturuuu.com', {
              headers: { Authorization: authorization, Cookie: 'valid=cookie' },
            })
          )
        ).ok
      ).toBe(false);
      expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
      expect(mocks.getPermissions).not.toHaveBeenCalled();
    }
  );
});

describe('protected build-info route authorization', () => {
  const user = { id: '33333333-3333-4333-8333-333333333333' };
  const getUser = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.createAdminClient.mockResolvedValue({ auth: { getUser } });
    mocks.getSatelliteAppSessionUser.mockResolvedValue(user);
    mocks.getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn(
        (permission: string) => permission === 'view_infrastructure'
      ),
    });
  });

  async function buildInfo(authorization?: string) {
    const { GET } = await import('../app/api/build-info/route');
    const headers = new Headers({ cookie: 'eligible=synthetic-session' });
    if (authorization !== undefined)
      headers.set('authorization', authorization);
    return GET(
      new Request('https://infrastructure.tuturuuu.com/api/build-info', {
        headers,
      })
    );
  }

  it('admits a root MEMBER with view_infrastructure without writing cookies', async () => {
    const response = await buildInfo('Bearer eyJbuildInfo');
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ appName: 'infrastructure' });
    expect(getUser).toHaveBeenCalledExactlyOnceWith('eyJbuildInfo');
    expect(mocks.getPermissions).toHaveBeenCalledExactlyOnceWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
  });

  it('admits the eligible cookie without Authorization as a fallback control', async () => {
    const response = await buildInfo();
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledExactlyOnceWith(
      'infra'
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it('denies anonymous access without exposing build identity', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const { GET } = await import('../app/api/build-info/route');
    const response = await GET(
      new Request('https://infrastructure.tuturuuu.com/api/build-info')
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'Basic invalid',
    'Bearer',
    'Bearer  invalid',
    'Bearer invalid extra',
    'Bearer invalid',
  ])(
    'rejects Authorization %j despite an eligible cookie',
    async (authorization) => {
      getUser.mockResolvedValue({
        data: { user: null },
        error: { status: 401 },
      });
      const response = await buildInfo(authorization);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
      expect(mocks.getPermissions).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['MEMBER', false],
    ['GUEST', true],
    [undefined, true],
  ] as const)(
    'denies membership=%s permission=%s',
    async (membershipType, permitted) => {
      mocks.getPermissions.mockResolvedValue({
        membershipType,
        containsPermission: vi.fn(() => permitted),
      });
      const response = await buildInfo('Bearer eyJbuildInfo');
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Infrastructure permission required',
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(mocks.getPermissions).toHaveBeenCalledExactlyOnceWith({
        user,
        wsId: ROOT_WORKSPACE_ID,
      });
    }
  );

  it('denies a missing root permission result', async () => {
    mocks.getPermissions.mockResolvedValue(null);
    const response = await buildInfo('Bearer eyJbuildInfo');
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
