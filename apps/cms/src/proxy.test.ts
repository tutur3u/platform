import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();
  const centralizedAuthOptions: unknown[] = [];

  return {
    authProxy,
    providerUser: vi.fn(),
    providerClaims: vi.fn(),
    centralizedAuthOptions,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn((options: unknown) => {
      centralizedAuthOptions.push(options);
      return authProxy;
    }),
    getAppSessionClaimsFromRequest: vi.fn(),
    getCurrentUserDefaultWorkspace: vi.fn(),
    getPermissions: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(),
    getWorkspaces: vi.fn(),
    guardApiProxyRequest: vi.fn(),
    hasRootExternalProjectsAdminPermission: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    isPersonalWorkspace: vi.fn(),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
    resolveWorkspaceExternalProjectBinding: vi.fn(),
    withForwardedInternalApiAuth: vi.fn(),
  };
});

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionClaimsFromRequest>
  ) => mocks.getAppSessionClaimsFromRequest(...args),
  hasSupportedSupabaseAuthCookie: (
    ...args: Parameters<typeof mocks.hasSupportedSupabaseAuthCookie>
  ) => mocks.hasSupportedSupabaseAuthCookie(...args),
  hasWebAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.hasWebAppSessionTokenFromRequest>
  ) => mocks.hasWebAppSessionTokenFromRequest(...args),
}));

vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => mocks.createCentralizedAuthProxy(...args),
  getRequestHeadersWithResponseCookies: (
    ...args: Parameters<typeof mocks.getRequestHeadersWithResponseCookies>
  ) => mocks.getRequestHeadersWithResponseCookies(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      getUser: mocks.providerUser,
      getClaims: mocks.providerClaims,
    },
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: async () => false,
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: false,
  }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getCurrentUserDefaultWorkspace>
  ) => mocks.getCurrentUserDefaultWorkspace(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/utils/api-proxy-guard')>(
    '@tuturuuu/utils/api-proxy-guard'
  )),
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspaces: (...args: Parameters<typeof mocks.getWorkspaces>) =>
    mocks.getWorkspaces(...args),
  isPersonalWorkspace: (
    ...args: Parameters<typeof mocks.isPersonalWorkspace>
  ) => mocks.isPersonalWorkspace(...args),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('./lib/external-projects/access', () => ({
  hasRootExternalProjectsAdminPermission: (
    ...args: Parameters<typeof mocks.hasRootExternalProjectsAdminPermission>
  ) => mocks.hasRootExternalProjectsAdminPermission(...args),
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

describe('CMS proxy auth mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardApiProxyRequest.mockReset();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(new Headers());
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.withForwardedInternalApiAuth.mockReturnValue({
      defaultHeaders: { authorization: 'Bearer satellite-session' },
    });
  });

  it('registers CMS auth as Supabase-first', () => {
    const options = mocks.centralizedAuthOptions[0] as
      | { appSession?: { sessionMode?: string; targetApp?: string } }
      | undefined;

    expect(options?.appSession).toMatchObject({
      sessionMode: 'supabase-first',
      targetApp: 'cms',
    });
  });

  it('refreshes product APIs in Supabase-first mode', async () => {
    const request = new NextRequest(
      'https://cms.tuturuuu.com/api/v1/admin/external-projects'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'cms',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:cms:api',
    });
  });

  it.each(['GET', 'HEAD'])(
    'keeps public build metadata %s independent of cookies',
    async (method) => {
      mocks.refreshAppSessionForRequest.mockResolvedValue({
        ok: false,
        error: 'Account assurance unavailable',
      });
      const request = new NextRequest(
        'https://cms.tuturuuu.com/api/build-info',
        {
          method,
        }
      );

      const response = await proxy(request);

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
        prefixBase: 'proxy:cms:api',
      });
    }
  );

  it.each(['GET', 'HEAD'])(
    'passes machine API %s credentials to the API auth boundary',
    async (method) => {
      mocks.refreshAppSessionForRequest.mockResolvedValue({
        ok: false,
        error: 'Account assurance unavailable',
      });
      const request = new NextRequest(
        'https://cms.tuturuuu.com/api/v1/admin/external-projects',
        {
          method,
          headers: { authorization: 'Bearer ttr_invalid_rollout_canary' },
        }
      );

      const response = await proxy(request);

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(request.headers.get('authorization')).toBe(
        'Bearer ttr_invalid_rollout_canary'
      );
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
        prefixBase: 'proxy:cms:api',
      });
    }
  );

  it.each(['a.b.c', 'ttr_app_invalid'])(
    'retains cookie MFA for unverified bearer %s',
    async (token) => {
      mocks.refreshAppSessionForRequest.mockResolvedValue({
        ok: false,
        error: 'MFA required',
      });
      const request = new NextRequest(
        'https://cms.tuturuuu.com/api/v1/admin/external-projects',
        {
          headers: {
            authorization: `Bearer ${token}`,
            cookie: 'tuturuuu_app_session=browser-session',
          },
        }
      );
      const response = await proxy(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
      expect(request.cookies.get('tuturuuu_app_session')?.value).toBe(
        'browser-session'
      );
      expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it.each(['ttr_invalid_rollout_canary', 'ttr_verified_fixture_key'])(
    'isolates machine transport %s from incidental cookies',
    async (token) => {
      const request = new NextRequest(
        'https://cms.tuturuuu.com/api/v1/workspaces/workspace/users',
        {
          headers: {
            authorization: `Bearer ${token}`,
            cookie:
              'tuturuuu_app_session=expired-session; sb-project-auth-token=expired-provider',
          },
        }
      );
      mocks.guardApiProxyRequest.mockImplementation(
        async (guardRequest: NextRequest) => {
          // Model an expired ambient credential's guard failure, if left attached.
          if (guardRequest.cookies.getAll().length)
            return NextResponse.json({ error: 'Expired' }, { status: 401 });
          return null;
        }
      );
      const response = await proxy(request);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(request.cookies.getAll()).toEqual([]);
      expect(request.headers.has('cookie')).toBe(false);
      expect(response.headers.get('x-middleware-request-authorization')).toBe(
        `Bearer ${token}`
      );
      expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    }
  );

  it('keeps public metadata usable with an invalid bearer and expired ambient credentials', async () => {
    const request = new NextRequest('https://cms.tuturuuu.com/api/build-info', {
      headers: {
        authorization: 'Bearer a.b.c',
        cookie: 'tuturuuu_app_session=expired-session',
      },
    });
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(request.cookies.getAll()).toEqual([]);
    expect(request.headers.has('authorization')).toBe(false);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('real API guard checks the cookie actor MFA despite an invalid JWT-shaped header', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    mocks.providerUser.mockResolvedValue({
      error: null,
      data: {
        user: {
          id: 'browser-actor',
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: 0 },
          },
        },
      },
    });
    mocks.providerClaims.mockResolvedValue({
      error: null,
      data: { claims: { sub: 'browser-actor', aal: 'aal1' } },
    });
    const guard = await vi.importActual<
      typeof import('@tuturuuu/utils/api-proxy-guard')
    >('@tuturuuu/utils/api-proxy-guard');
    mocks.guardApiProxyRequest.mockImplementation(guard.guardApiProxyRequest);
    const cookie = JSON.stringify({ access_token: 'cookie-provider-token' });
    const request = new NextRequest(
      'https://cms.tuturuuu.com/api/v1/admin/external-projects',
      {
        headers: {
          authorization: 'Bearer a.b.c',
          cookie: `sb-project-auth-token=${encodeURIComponent(cookie)}`,
        },
      }
    );
    const response = await proxy(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(mocks.providerUser).toHaveBeenCalledWith('cookie-provider-token');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it('real API guard ignores expired ambient cookies only after machine transport removes them', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    mocks.providerUser.mockResolvedValue({
      error: new Error('expired'),
      data: { user: null },
    });
    const guard = await vi.importActual<
      typeof import('@tuturuuu/utils/api-proxy-guard')
    >('@tuturuuu/utils/api-proxy-guard');
    mocks.guardApiProxyRequest.mockImplementation(guard.guardApiProxyRequest);
    const cookie = JSON.stringify({ access_token: 'expired-provider-token' });
    const request = new NextRequest(
      'https://cms.tuturuuu.com/api/v1/workspaces/workspace/users',
      {
        headers: {
          authorization: 'Bearer ttr_fixture_machine_key',
          cookie: `sb-project-auth-token=${encodeURIComponent(cookie)}`,
        },
      }
    );
    // Confirm this actual guard would reject the same unsanitized request.
    expect(
      (
        await guard.guardApiProxyRequest(request, {
          prefixBase: 'proxy:cms:api',
        })
      )?.status
    ).toBe(401);
    mocks.providerUser.mockClear();
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.providerUser).not.toHaveBeenCalled();
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-request-authorization')).toBe(
      'Bearer ttr_fixture_machine_key'
    );
    vi.unstubAllEnvs();
  });

  it('preserves an API guard rejection for machine credentials', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const response = await proxy(
      new NextRequest(
        'https://cms.tuturuuu.com/api/v1/admin/external-projects',
        { headers: { authorization: 'Bearer ttr_invalid_rollout_canary' } }
      )
    );
    expect(response.status).toBe(403);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it.each(['/api/v1/admin/external-projects', '/api/build-info-extra'])(
    'retains browser assurance failures for %s',
    async (path) => {
      mocks.refreshAppSessionForRequest.mockResolvedValue({
        ok: false,
        error: 'Account assurance unavailable',
      });
      const response = await proxy(
        new NextRequest(`https://cms.tuturuuu.com${path}`)
      );
      expect(response.status).toBe(503);
      expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it('redirects authenticated root requests before locale middleware can fall through to a 404', async () => {
    const request = new NextRequest('https://cms.tuturuuu.com/');
    const authRequestHeaders = new Headers({
      authorization: 'Bearer cms-app-session',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({
      email: 'user@example.com',
      sub: 'user-1',
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);
    mocks.getWorkspaces.mockResolvedValue([]);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });
    mocks.hasRootExternalProjectsAdminPermission.mockReturnValue(false);

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://cms.tuturuuu.com/no-access'
    );
    expect(mocks.getAppSessionClaimsFromRequest).toHaveBeenCalledWith(
      { headers: authRequestHeaders },
      { targetApp: 'cms' }
    );
  });

  it('redirects Supabase-authenticated root requests before locale fallback', async () => {
    const request = new NextRequest('https://cms.tuturuuu.com/');
    const authRequestHeaders = new Headers({
      cookie: 'sb-test-auth-token=shared',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      personal: false,
    });

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://cms.tuturuuu.com/44444444-4444-4444-8444-444444444444'
    );
    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      authRequestHeaders
    );
    expect(mocks.getWorkspaces).not.toHaveBeenCalled();
  });
});
