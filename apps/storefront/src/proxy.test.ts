import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  getAppSessionClaimsFromRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_COOKIE_NAME: 'tuturuuu_app_session',
  APP_SESSION_REFRESH_COOKIE_NAME: 'tuturuuu_app_session_refresh',
  WEB_APP_SESSION_COOKIE_NAME: 'tuturuuu_web_app_session',
  WEB_APP_SESSION_REFRESH_COOKIE_NAME: 'tuturuuu_web_app_session_refresh',
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

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
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

describe('Storefront proxy', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps storefront pages publicly reachable', async () => {
    const request = new NextRequest(
      'https://storefront.tuturuuu.com/studio-store'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('redirects storefront checkout pages to login when unauthenticated', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    const request = new NextRequest(
      'https://storefront.tuturuuu.com/studio-store/checkout'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://storefront.tuturuuu.com/login?next=%2Fstudio-store%2Fcheckout'
    );
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'storefront',
    });
  });

  it('refreshes API app sessions for the storefront target app', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const request = new NextRequest(
      'https://storefront.tuturuuu.com/api/v1/inventory/storefronts/shop',
      {
        headers: {
          cookie: 'tuturuuu_app_session=ttr_app_existing',
        },
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'storefront',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:storefront:api',
    });
  });

  it.each([
    [
      'GET',
      'https://storefront.tuturuuu.com/api/v1/inventory/storefronts/shop',
    ],
    [
      'POST',
      'https://storefront.tuturuuu.com/api/v1/inventory/storefronts/shop/analytics/events',
    ],
    [
      'GET',
      'https://storefront.tuturuuu.com/api/v1/inventory/orders/public-token',
    ],
  ])('allows anonymous public storefront API %s %s', async (method, url) => {
    const request = new NextRequest(url, { method });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:storefront:api',
    });
  });

  it('gates checkout API requests when app-session refresh fails', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://storefront.tuturuuu.com/api/v1/inventory/storefronts/shop/checkouts',
      { method: 'POST' }
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps unrelated API routes gated when app-session refresh fails', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://storefront.tuturuuu.com/api/v1/workspaces/ws-1/private-data'
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
