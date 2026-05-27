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
  hasWebAppSessionTokenFromRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

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

describe('Inventory proxy storefront access', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
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
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:inventory:api',
    });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      guardResponse
    );
  });
});
