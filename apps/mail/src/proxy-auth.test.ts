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
    createCentralizedAuthProxy: vi.fn(() => authProxy),
    getAppSessionClaimsFromRequest: vi.fn(),
    getRequestHeadersWithResponseCookies: vi.fn(
      (_request: NextRequest, response: NextResponse) => response.headers
    ),
    guardApiProxyRequest: vi.fn(),
    hasSupportedSupabaseAuthCookie: vi.fn(),
    hasWebAppSessionTokenFromRequest: vi.fn(),
    normalizeAuthRedirectPath: vi.fn(
      (value: string | null | undefined, _origin: string, fallback: string) =>
        value ?? fallback
    ),
    propagateAuthCookies: vi.fn(),
    refreshAppSessionForRequest: vi.fn(),
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
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
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

describe('Mail proxy auth handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  it('consumes verify-token requests before centralized auth redirects', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://mail.tuturuuu.localhost/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/verify-token?token=copy-token&nextUrl=%2Fpersonal'
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

  it('keeps Supabase-authenticated login requests inside Mail instead of restarting central handoff', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.normalizeAuthRedirectPath.mockReturnValue('/personal');
    const request = new NextRequest(
      'https://mail.tuturuuu.localhost/login?next=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response.headers.get('Location')).toBe(
      'https://mail.tuturuuu.localhost/personal'
    );
    expect(mocks.authProxy).toHaveBeenCalledWith(request);
    expect(mocks.normalizeAuthRedirectPath).toHaveBeenCalledWith(
      '/personal',
      'https://mail.tuturuuu.localhost',
      '/personal'
    );
  });
});
