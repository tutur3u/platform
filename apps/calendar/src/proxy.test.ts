import { isPersonalWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();
  const centralizedAuthOptions: unknown[] = [];

  return {
    authProxy,
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
    getRequestHeadersWithResponseCookies: vi.fn(),
    guardApiProxyRequest: vi.fn(),
    hasAuthenticatedBearerToken: vi.fn(),
    isTrustedProxyBypassRequest: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
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
  normalizeAuthRedirectPath: vi.fn(
    (_value: string | null | undefined, _origin: string, fallback: string) =>
      fallback
  ),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getCurrentUserDefaultWorkspace>
  ) => mocks.getCurrentUserDefaultWorkspace(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  isTrustedProxyBypassRequest: (
    ...args: Parameters<typeof mocks.isTrustedProxyBypassRequest>
  ) => mocks.isTrustedProxyBypassRequest(...args),
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: (
    ...args: Parameters<typeof mocks.hasAuthenticatedBearerToken>
  ) => mocks.hasAuthenticatedBearerToken(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

describe('Calendar proxy verify-token handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    mocks.authProxy.mockReset();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.withForwardedInternalApiAuth.mockReturnValue({
      defaultHeaders: { authorization: 'Bearer app-session' },
    });
  });

  it('returns MFA_REQUIRED while retaining the provider recovery session', async () => {
    const rotated = NextResponse.next();
    rotated.cookies.set('sb-project-auth-token', 'rotated');
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: false,
      error: 'MFA required',
      response: rotated,
    });
    const response = await proxy(
      new NextRequest('https://example.com/api/v1/users/me/profile')
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(response.headers.get('set-cookie')).toContain(
      'sb-project-auth-token=rotated'
    );
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it('accepts a trusted scheduler without requiring a browser session', async () => {
    mocks.isTrustedProxyBypassRequest.mockReturnValue(true);
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const request = new NextRequest(
      'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
      {
        headers: { authorization: 'Bearer scheduler-test-secret' },
      }
    );
    const response = await proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.isTrustedProxyBypassRequest).toHaveBeenCalledWith(
      request.nextUrl.pathname,
      request.headers
    );
    expect(mocks.guardApiProxyRequest).toHaveBeenCalled();
  });

  it.each([
    '/api/cron/calendar/provider-sync',
    '/api/cron/calendar/smart-schedule',
  ])('rejects untrusted scheduler credentials at %s', async (path) => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const response = await proxy(
      new NextRequest(`https://calendar.tuturuuu.com${path}`, {
        headers: { authorization: 'Bearer forged-secret' },
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalled();
  });

  it('does not apply scheduler trust outside cron routes', async () => {
    mocks.isTrustedProxyBypassRequest.mockReturnValue(true);
    mocks.refreshAppSessionForRequest.mockResolvedValue({ ok: false });
    const response = await proxy(
      new NextRequest('https://calendar.tuturuuu.com/api/v1/workspaces')
    );
    expect(response.status).toBe(401);
    expect(mocks.isTrustedProxyBypassRequest).not.toHaveBeenCalled();
  });

  it('registers Calendar auth as Supabase-first', () => {
    const options = mocks.centralizedAuthOptions[0] as
      | { appSession?: { sessionMode?: string; targetApp?: string } }
      | undefined;

    expect(options?.appSession).toMatchObject({
      sessionMode: 'supabase-first',
      targetApp: 'calendar',
    });
  });

  it.each(['users/calendar-settings', 'workspaces/personal/calendar-settings'])(
    'isolates verified preference actors on %s without refreshing bearer auth',
    async (path) => {
      mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
      const request = new NextRequest(`https://calendar.test/api/v1/${path}`, {
        headers: { authorization: 'Bearer synthetic-token' },
      });
      await proxy(request);
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
        prefixBase: 'proxy:calendar:preferences',
        useVerifiedBearerActor: true,
        diagnosticPolicyName: 'calendar-native-preferences',
      });
    }
  );

  it('refreshes product APIs in Supabase-first mode', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    const request = new NextRequest(
      'https://calendar.tuturuuu.com/api/v1/calendar/events'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'calendar',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:calendar:api',
    });
  });

  it('consumes verify-token requests before centralized auth and locale rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://calendar.tuturuuu.com/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);
    const request = new NextRequest(
      'https://calendar.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('redirects authenticated root requests to the personal workspace fallback', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({
      sub: 'user-1',
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    const request = new NextRequest('https://calendar.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/personal'
    );
    expect(mocks.getCurrentUserDefaultWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.objectContaining({
          authorization: 'Bearer app-session',
        }),
      })
    );
    expect(mocks.propagateAuthCookies).toHaveBeenCalled();
  });

  it('redirects authenticated root requests to the default workspace', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({
      sub: 'user-1',
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      personal: false,
    });
    const request = new NextRequest('https://calendar.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/11111111-1111-4111-8111-111111111111'
    );
  });

  it('redirects authenticated locale root requests to the default workspace', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({
      sub: 'user-1',
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      personal: false,
    });
    const request = new NextRequest('https://calendar.tuturuuu.com/en');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/22222222-2222-4222-8222-222222222222'
    );
  });

  it('falls back to personal when default workspace lookup fails', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({
      sub: 'user-1',
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockRejectedValue(
      new Error('internal api unavailable')
    );
    const request = new NextRequest('https://calendar.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/personal'
    );
  });

  it('redirects Supabase-authenticated root requests without a legacy app session', async () => {
    const authRequestHeaders = new Headers({
      cookie: 'sb-test-auth-token=shared',
    });
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(
      authRequestHeaders
    );
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      personal: false,
    });
    const request = new NextRequest('https://calendar.tuturuuu.com/');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/33333333-3333-4333-8333-333333333333'
    );
    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      authRequestHeaders
    );
  });

  it('returns centralized auth redirects for unauthenticated root requests', async () => {
    const authRedirect = NextResponse.redirect(
      'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Fcalendar.tuturuuu.com%2Fverify-token%3FnextUrl%3D%252F'
    );
    mocks.authProxy.mockReturnValue(authRedirect);
    const request = new NextRequest('https://calendar.tuturuuu.com/');

    const response = await proxy(request);

    expect(response).toBe(authRedirect);
    expect(mocks.getCurrentUserDefaultWorkspace).not.toHaveBeenCalled();
  });
});

describe('PWA public-route boundary', () => {
  it('excludes only exact offline assets and worker files', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of [
      '/offline.html',
      '/offline.css',
      '/offline.js',
      '/serwist/sw.js',
      '/serwist/sw.js.map',
    ]) {
      expect(matcher.test(path)).toBe(false);
    }
    for (const path of [
      '/serwist-workspace',
      '/serwist-workspace/tasks',
      '/offlineXhtml',
      '/offline.html-workspace',
      '/api/v1/tasks',
    ]) {
      expect(matcher.test(path)).toBe(true);
    }
  });
  it('reaches the bare base path once Next prefixes the matchers', async () => {
    // Next's build-time matcher compiler; its declaration file omits it.
    const { getMiddlewareMatchers } =
      (await import('next/dist/build/analysis/get-page-static-info')) as unknown as {
        getMiddlewareMatchers: (
          matcher: typeof config.matcher,
          nextConfig: { basePath: string }
        ) => { regexp: string }[];
      };
    const matchers = getMiddlewareMatchers(config.matcher, {
      basePath: '/calendar',
    }).map(({ regexp }) => new RegExp(regexp));
    const matches = (path: string) => matchers.some((re) => re.test(path));
    for (const path of ['/calendar', '/calendar/', '/calendar/personal']) {
      expect(matches(path)).toBe(true);
    }
    for (const path of ['/', '/personal', '/calendar/_next/static/a.js']) {
      expect(matches(path)).toBe(false);
    }
  });
  it('preserves terminal auth outage before workspace and locale handling', async () => {
    const unavailable = NextResponse.json(
      { code: 'APP_SESSION_REFRESH_UNAVAILABLE' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
    mocks.authProxy.mockReturnValue(unavailable);
    const response = await proxy(
      new NextRequest('https://calendar.tuturuuu.com/dashboard')
    );
    expect(response).toBe(unavailable);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.getRequestHeadersWithResponseCookies).not.toHaveBeenCalled();
    expect(mocks.getCurrentUserDefaultWorkspace).not.toHaveBeenCalled();
  });
});

describe('mounted Calendar shared-session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockImplementation(
      (request: NextRequest) => request.headers
    );
  });
  it.each([
    '/calendar/personal',
    '/calendar/api/v1/calendar/connections',
    '/calendar/verify-token?token=untrusted',
  ])('does not mint or clear a satellite session for %s', async (path) => {
    const response = await proxy(
      new NextRequest(`https://tuturuuu.com${path}`, {
        headers: { cookie: 'sb-fixture-auth-token=shared' },
        nextConfig: { basePath: '/calendar' },
      })
    );
    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
    expect(
      response.headers
        .getSetCookie()
        .filter((cookie) =>
          /^(?:tuturuuu_app_session|sb-[^=]+-auth-token)/u.test(cookie)
        )
    ).toEqual([]);
  });
});

describe('Calendar proxy redirect caching', () => {
  const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-1' });
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(new Headers());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.withForwardedInternalApiAuth.mockReturnValue({});
    vi.mocked(isPersonalWorkspace).mockResolvedValue(false);
  });

  const expectPrivateRedirect = (response: Response, location: string) => {
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(location);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  };

  it('marks the root-workspace remap uncacheable', async () => {
    const response = await proxy(
      new NextRequest(
        'https://calendar.tuturuuu.com/en/00000000-0000-0000-0000-000000000000/settings?view=week'
      )
    );
    expectPrivateRedirect(
      response,
      'https://calendar.tuturuuu.com/en/internal/settings?view=week'
    );
  });

  it('marks the personal-workspace remap uncacheable', async () => {
    vi.mocked(isPersonalWorkspace).mockResolvedValue(true);
    const response = await proxy(
      new NextRequest(`https://calendar.tuturuuu.com/${WORKSPACE_ID}?d=1`)
    );
    expectPrivateRedirect(
      response,
      'https://calendar.tuturuuu.com/personal?d=1'
    );
  });

  it('preserves the query on the mounted default-workspace redirect', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: WORKSPACE_ID,
      personal: false,
    });
    const query = '?view=week&filter=a%2Fb&filter=c';
    const response = await proxy(
      new NextRequest(`https://tuturuuu.com/calendar${query}`, {
        nextConfig: { basePath: '/calendar' },
      })
    );
    expectPrivateRedirect(
      response,
      `https://tuturuuu.com/calendar/${WORKSPACE_ID}${query}`
    );
  });

  it('preserves the query on the mounted localized fallback redirect', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockRejectedValue(new Error('down'));
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/calendar/vi?view=week', {
        nextConfig: { basePath: '/calendar' },
      })
    );
    expectPrivateRedirect(
      response,
      'https://tuturuuu.com/calendar/personal?view=week'
    );
  });

  it('marks the signed-in login short-circuit uncacheable', async () => {
    const response = await proxy(
      new NextRequest('https://calendar.tuturuuu.com/login?next=%2Fabc')
    );
    expectPrivateRedirect(response, 'https://calendar.tuturuuu.com/personal');
  });

  it('marks the mounted verify-token resume uncacheable', async () => {
    const response = await proxy(
      new NextRequest(
        'https://tuturuuu.com/calendar/verify-token?token=t&nextUrl=%2Fpersonal',
        { nextConfig: { basePath: '/calendar' } }
      )
    );
    expectPrivateRedirect(response, 'https://tuturuuu.com/calendar/personal');
  });

  it('marks delegated auth and verify-token redirects uncacheable', async () => {
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(
      NextResponse.redirect('https://calendar.tuturuuu.com/personal')
    );
    expectPrivateRedirect(
      await proxy(
        new NextRequest('https://calendar.tuturuuu.com/verify-token?token=t')
      ),
      'https://calendar.tuturuuu.com/personal'
    );

    mocks.authProxy.mockReturnValueOnce(
      NextResponse.redirect('https://tuturuuu.com/login')
    );
    expectPrivateRedirect(
      await proxy(new NextRequest('https://calendar.tuturuuu.com/dashboard')),
      'https://tuturuuu.com/login'
    );
  });

  it('leaves rendered documents to their own cache policy', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    const response = await proxy(
      new NextRequest(`https://calendar.tuturuuu.com/${WORKSPACE_ID}`)
    );
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
