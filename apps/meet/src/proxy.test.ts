import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildInfoHandler } from '../../../packages/utils/src/build-info-route';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();
  let centralizedAuthOptions: unknown;

  return {
    authProxy,
    getCentralizedAuthOptions: () => centralizedAuthOptions,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn((options: unknown) => {
      centralizedAuthOptions = options;
      return authProxy;
    }),
    getAppSessionClaimsFromRequest: vi.fn(),
    getCurrentUserDefaultWorkspace: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(
      (request: NextRequest) => request.headers
    ),
    guardApiProxyRequest: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    normalizeAuthRedirectPath: vi.fn(
      (_value: string | null | undefined, _origin: string, fallback: string) =>
        fallback
    ),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
    withForwardedInternalApiAuth: vi.fn((headers: Headers) => ({ headers })),
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
  normalizeAuthRedirectPath: (
    ...args: Parameters<typeof mocks.normalizeAuthRedirectPath>
  ) => mocks.normalizeAuthRedirectPath(...args),
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
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

vi.mock('@tuturuuu/meet-core/i18n/routing', () => ({
  supportedLocales: ['en', 'vi'],
  defaultLocale: 'en',
}));

describe('Meet proxy auth handoff', () => {
  beforeEach(() => {
    mocks.authProxy.mockClear();
    mocks.clearSupabaseAuthCookies.mockClear();
    mocks.consumeVerifyTokenRequest.mockClear();
    mocks.getAppSessionClaimsFromRequest.mockClear();
    mocks.getCurrentUserDefaultWorkspace.mockClear();
    mocks.getRequestHeadersWithResponseCookies.mockClear();
    mocks.guardApiProxyRequest.mockClear();
    mocks.hasSupportedSupabaseAuthCookie.mockClear();
    mocks.hasWebAppSessionTokenFromRequest.mockClear();
    mocks.normalizeAuthRedirectPath.mockClear();
    mocks.propagateAuthCookies.mockClear();
    mocks.refreshAppSessionForRequest.mockClear();
    mocks.withForwardedInternalApiAuth.mockClear();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockImplementation(
      (request: NextRequest) => request.headers
    );
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockImplementation(
      (_value: string | null | undefined, _origin: string, fallback: string) =>
        fallback
    );
    mocks.withForwardedInternalApiAuth.mockImplementation(
      (headers: Headers) => ({ headers })
    );
  });

  it('resumes a pending invite when authentication returns to the home page', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    const invite = '/r/pmfe4p67f-s4z33jjmr-vv1zmrer';
    const response = await proxy(
      new NextRequest('https://meet.tuturuuu.com/', {
        headers: { cookie: `meet_pending_invite=${invite}` },
      })
    );
    expect(response.headers.get('location')).toBe(
      `https://meet.tuturuuu.com${invite}`
    );
    expect(response.cookies.get('meet_pending_invite')?.maxAge).toBe(0);
    expect(mocks.getCurrentUserDefaultWorkspace).not.toHaveBeenCalled();
  });

  it('registers Meet auth public paths without making root public', () => {
    const options = mocks.getCentralizedAuthOptions() as
      | {
          appSession: { targetApp: string };
          excludeRootPath: boolean;
          isPublicPath?: (pathname: string) => boolean;
          publicPaths: string[];
        }
      | undefined;

    expect(options).toMatchObject({
      appSession: { targetApp: 'meet' },
      excludeRootPath: true,
      publicPaths: expect.arrayContaining([
        '/verify-token',
        '/en/verify-token',
        '/vi/verify-token',
        '/login',
        '/en/login',
        '/vi/login',
      ]),
    });
    expect(options?.isPublicPath?.('/0123456789abcdef0123456789abcdef')).toBe(
      true
    );
    expect(options?.isPublicPath?.('/r/pmfe4p67f-s4z33jjmr-vv1zmrer')).toBe(
      true
    );
    expect(options?.isPublicPath?.('/vi/r/pmfe4p67f-s4z33jjmr-vv1zmrer')).toBe(
      true
    );
    expect(
      options?.isPublicPath?.('/vi/r/pmfe4p67f-s4z33jjmr-vv1zmrer/preview')
    ).toBe(true);
    expect(options?.isPublicPath?.('/r/invalid/preview')).toBe(false);
    expect(
      options?.isPublicPath?.('/r/pmfe4p67f-s4z33jjmr-vv1zmrer/preview/private')
    ).toBe(false);
    expect(options?.isPublicPath?.('/r/invalid')).toBe(false);
    expect(options?.isPublicPath?.('/personal/plans')).toBe(false);
    expect(options?.isPublicPath?.('/personal/meetings')).toBe(false);
  });

  it('consumes verify-token requests before centralized auth redirects', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://meet.tuturuuu.localhost/'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://meet.tuturuuu.localhost/verify-token?token=copy-token&nextUrl=%2F'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('redirects authenticated root requests to personal workspace meetings', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: 'team-workspace',
      personal: false,
    });

    const request = new NextRequest('https://meet.tuturuuu.localhost/');
    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://meet.tuturuuu.localhost/personal/meetings'
    );
    expect(mocks.getCurrentUserDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.propagateAuthCookies).toHaveBeenCalled();
  });

  it('redirects Supabase-authenticated root requests to personal workspace meetings', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: 'team-workspace',
      personal: false,
    });

    const request = new NextRequest('https://meet.tuturuuu.localhost/');
    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://meet.tuturuuu.localhost/personal/meetings'
    );
    expect(mocks.getCurrentUserDefaultWorkspace).not.toHaveBeenCalled();
  });

  it('redirects authenticated login requests back to the normalized next path', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal/plans');

    const request = new NextRequest(
      'https://meet.tuturuuu.localhost/login?nextUrl=%2Fpersonal%2Fplans'
    );
    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://meet.tuturuuu.localhost/personal/plans'
    );
    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      '/personal/plans',
      'https://meet.tuturuuu.localhost',
      '/'
    );
  });
  it.each([
    ['/vi/workspace/team', '/vi/team/meetings'],
    ['/workspace/personal/plans', '/personal/plans'],
  ])(
    'avoids an extra workspace landing redirect for %s',
    async (path, target) => {
      const response = await proxy(
        new NextRequest(`https://meet.tuturuuu.localhost${path}`)
      );
      expect(response.status).toBe(308);
      expect(response.headers.get('Location')).toBe(
        `https://meet.tuturuuu.localhost${target}`
      );
    }
  );
  it.each([
    '/workspace/team?source=sidebar-apps',
    '/workspace/team/meetings?source=sidebar-apps',
    '/vi/workspace/team/meetings?source=sidebar-apps',
    '/internal/meetings?source=sidebar-apps',
    '/vi/workspace/team?source=sidebar-apps',
    '/00000000-0000-0000-0000-000000000000?source=sidebar-apps',
  ])('opens Personal for implicit launcher context: %s', async (path) => {
    const response = await proxy(
      new NextRequest(`https://meet.tuturuuu.localhost${path}`)
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      `https://meet.tuturuuu.localhost${path.startsWith('/vi/') ? '/vi' : ''}/personal/meetings`
    );
  });

  it.each([
    '/internal/meetings',
    '/vi/internal/plans',
    '/r/room-code?source=sidebar-apps',
  ])(
    'preserves explicit workspace and meeting destinations: %s',
    async (path) => {
      mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
      const response = await proxy(
        new NextRequest(`https://meet.tuturuuu.localhost${path}`)
      );
      expect(response.headers.get('Location')).toBeNull();
    }
  );
});

// Exercise the actual public handler after the real proxy boundary admits it.
describe('Meet public build identity boundary', () => {
  beforeEach(() => {
    mocks.refreshAppSessionForRequest.mockReset();
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: false,
      error: 'Invalid app session',
    });
    mocks.guardApiProxyRequest.mockReset();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
  });
  it.each([undefined, 'ttr_app_session=synthetic-stale'])(
    'admits only public GET without refreshing absent/stale session %s',
    async (cookie) => {
      const response = await proxy(
        new NextRequest('https://meet.tuturuuu.com/api/build-info', {
          headers: cookie ? { cookie } : undefined,
        })
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
      const identity = createBuildInfoHandler('meet')();
      expect(identity.status).toBe(200);
      expect(identity.headers.get('cache-control')).toBe('no-store, max-age=0');
      expect((await identity.json()).appName).toBe('meet');
    }
  );
  it.each([
    ['POST', '/api/build-info'],
    ['HEAD', '/api/build-info'],
    ['GET', '/api/build-info/'],
    ['GET', '/api/build-info-extra'],
    ['GET', '/api/build-info/private'],
    ['GET', '/api/meet-ai/private'],
  ])('retains session admission for %s %s', async (method, path) => {
    const response = await proxy(
      new NextRequest(`https://meet.tuturuuu.com${path}`, { method })
    );
    expect(response.status).toBe(401);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
  it.each([
    ['MFA_REQUIRED', 403],
    ['rate-limited', 429],
  ])(
    'preserves API guard denial %s on the public identity route',
    async (code, status) => {
      mocks.guardApiProxyRequest.mockResolvedValue(
        NextResponse.json({ code }, { status })
      );
      const response = await proxy(
        new NextRequest('https://meet.tuturuuu.com/api/build-info')
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code });
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    }
  );
  it('retains private API MFA failure instead of reaching the route', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: false,
      error: 'MFA required',
    });
    const response = await proxy(
      new NextRequest('https://meet.tuturuuu.com/api/meet-ai/private')
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('MFA_REQUIRED');
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
