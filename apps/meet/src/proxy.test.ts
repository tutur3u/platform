import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => {
  const authProxy = vi.fn();

  return {
    authProxy,
    clearSupabaseAuthCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response
    ),
    consumeVerifyTokenRequest: vi.fn(),
    createCentralizedAuthProxy: vi.fn((_options: unknown) => authProxy),
    getAppSessionClaimsFromRequest: vi.fn(),
    getCurrentUserDefaultWorkspace: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(
      (request: NextRequest) => request.headers
    ),
    guardApiProxyRequest: vi.fn(),
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

vi.mock('@/i18n/routing', () => ({
  supportedLocales: ['en', 'vi'],
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
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.normalizeAuthRedirectPath.mockImplementation(
      (_value: string | null | undefined, _origin: string, fallback: string) =>
        fallback
    );
    mocks.withForwardedInternalApiAuth.mockImplementation(
      (headers: Headers) => ({ headers })
    );
  });

  it('registers Meet auth public paths without making root public', () => {
    const options = mocks.createCentralizedAuthProxy.mock.calls[0]?.[0] as
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
    expect(options?.isPublicPath?.('/workspace/personal/plans')).toBe(false);
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

  it('redirects authenticated root requests to default workspace plans', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: 'team-workspace',
      personal: false,
    });

    const request = new NextRequest('https://meet.tuturuuu.localhost/');
    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://meet.tuturuuu.localhost/workspace/team-workspace/plans'
    );
    expect(mocks.getCurrentUserDefaultWorkspace).toHaveBeenCalledWith({
      headers: request.headers,
    });
    expect(mocks.propagateAuthCookies).toHaveBeenCalled();
  });

  it('redirects authenticated login requests back to the normalized next path', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-id' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue(
      '/workspace/personal/plans'
    );

    const request = new NextRequest(
      'https://meet.tuturuuu.localhost/login?nextUrl=%2Fworkspace%2Fpersonal%2Fplans'
    );
    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://meet.tuturuuu.localhost/workspace/personal/plans'
    );
    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      '/workspace/personal/plans',
      'https://meet.tuturuuu.localhost',
      '/'
    );
  });
});
