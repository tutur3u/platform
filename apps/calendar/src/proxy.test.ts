import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

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

vi.mock('@tuturuuu/auth/proxy', () => ({
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

  it('registers Calendar auth as Supabase-first', () => {
    const options = mocks.centralizedAuthOptions[0] as
      | { appSession?: { sessionMode?: string; targetApp?: string } }
      | undefined;

    expect(options?.appSession).toMatchObject({
      sessionMode: 'supabase-first',
      targetApp: 'calendar',
    });
  });

  it('refreshes product APIs in Supabase-first mode', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
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
