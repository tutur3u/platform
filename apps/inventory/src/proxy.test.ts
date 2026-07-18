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
  hasAuthenticatedBearerToken: vi.fn(),
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
  hasAuthenticatedBearerToken: (
    ...args: Parameters<typeof mocks.hasAuthenticatedBearerToken>
  ) => mocks.hasAuthenticatedBearerToken(...args),
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

describe('Inventory proxy storefront access', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('consumes verify-token requests before operator auth redirects', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://inventory.tuturuuu.com/dashboard'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fdashboard'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('keeps public storefront pages outside the operator auth redirect', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);

    const request = new NextRequest(
      'https://inventory.tuturuuu.com/store/studio-store'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.getAppSessionClaimsFromRequest).not.toHaveBeenCalled();
    expect(mocks.hasWebAppSessionTokenFromRequest).not.toHaveBeenCalled();
  });

  it('still redirects unauthenticated operator routes to local login', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });

    const request = new NextRequest(
      'https://inventory.tuturuuu.com/personal/catalog'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://inventory.tuturuuu.com/login?next=%2Fpersonal%2Fcatalog'
    );
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'inventory',
    });
  });

  it('allows protected operator routes with a shared Supabase session', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      claims: {
        aud: 'tuturuuu-api',
        email: 'local@tuturuuu.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'tuturuuu',
        jti: 'supabase:user-1',
        origin_app: 'web',
        scopes: ['internal-app:session'],
        sub: 'user-1',
        target_app: 'inventory',
        typ: 'app_coordination',
      },
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);

    const request = new NextRequest(
      'https://inventory.tuturuuu.com/personal/catalog'
    );
    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'inventory',
    });
  });

  it('guards local auth API routes before route handling', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Payload Too Large' },
      { status: 413 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/auth/verify-app-token',
      {
        body: '{}',
        headers: { 'content-length': '524289' },
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(response.status).toBe(413);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
    );
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      guardResponse
    );
  });

  it('passes mobile Supabase bearer requests through to inventory route auth', async () => {
    mocks.hasAuthenticatedBearerToken.mockReturnValue(true);
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/inventory/overview',
      { headers: { authorization: 'Bearer header.payload.signature' } }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
    );
  });

  it('passes cron-secret requests through to inventory route auth', async () => {
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/cron/inventory/checkout-expiry',
      { headers: { authorization: 'Bearer cron-secret' } }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
    );
  });

  it.each([
    ['GET', 'https://inventory.tuturuuu.com/api/v1/inventory/storefronts/shop'],
    [
      'POST',
      'https://inventory.tuturuuu.com/api/v1/inventory/storefronts/shop/analytics/events',
    ],
    [
      'GET',
      'https://inventory.tuturuuu.com/api/v1/inventory/orders/public-token',
    ],
    [
      'POST',
      'https://inventory.tuturuuu.com/api/v1/inventory/polar/webhook/ws-1',
    ],
    [
      'POST',
      'https://inventory.tuturuuu.com/api/v1/inventory/square/webhook/ws-1',
    ],
    ['POST', 'https://inventory.tuturuuu.com/api/v1/inventory/square/webhook'],
  ])('allows anonymous public inventory API %s %s', async (method, url) => {
    const request = new NextRequest(url, { method });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
    );
  });

  it('keeps non-POST Polar webhook API requests gated', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/inventory/polar/webhook/ws-1',
      { method: 'GET' }
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps non-POST Square webhook API requests gated', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/inventory/square/webhook/ws-1',
      { method: 'GET' }
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('gates checkout API requests when app-session refresh fails', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/inventory/storefronts/shop/checkouts',
      { method: 'POST' }
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('refreshes credentialed public storefront API requests', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/inventory/storefronts/shop',
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
      targetApp: 'inventory',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
    );
  });

  it('isolates workspace sales CRUD from unrelated Inventory mutations', async () => {
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/inventory/sales/sale-1',
      { method: 'PATCH' }
    );

    await proxy(request);

    const options = mocks.guardApiProxyRequest.mock.calls.at(-1)?.[1];
    const policy = options?.additionalRoutePolicies?.[0];
    const productRequest = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/inventory/products/product-1',
      { method: 'PATCH' }
    );

    expect(policy).toMatchObject({
      key: 'inventory-sales',
      rateLimits: {
        get: [],
        mutate: [
          { duration: '1 m', limit: 60, window: 'minute' },
          { duration: '1 h', limit: 600, window: 'hour' },
          { duration: '1 d', limit: 5000, window: 'day' },
        ],
      },
    });
    expect(policy?.matches(request)).toBe(true);
    expect(policy?.matches(productRequest)).toBe(false);
  });

  it('gives product and stock-row CRUD a dedicated bulk-safe mutation budget', async () => {
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/products/product-1/inventory',
      { method: 'PATCH' }
    );

    await proxy(request);

    const options = mocks.guardApiProxyRequest.mock.calls.at(-1)?.[1];
    const policy = options?.additionalRoutePolicies?.[1];
    const saleRequest = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/inventory/sales/sale-1',
      { method: 'PATCH' }
    );

    expect(policy).toMatchObject({
      key: 'inventory-product-crud',
      rateLimits: {
        get: [],
        mutate: [
          { duration: '1 m', limit: 180, window: 'minute' },
          { duration: '1 h', limit: 1200, window: 'hour' },
          { duration: '1 d', limit: 10_000, window: 'day' },
        ],
      },
    });
    expect(policy?.matches(request)).toBe(true);
    expect(policy?.matches(saleRequest)).toBe(false);
  });

  it('keeps unrelated API routes gated when app-session refresh fails', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });
    const request = new NextRequest(
      'https://inventory.tuturuuu.com/api/v1/workspaces/ws-1/private-data'
    );

    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
