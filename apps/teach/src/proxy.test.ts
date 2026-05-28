import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
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

describe('Teach proxy local auth API guard', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps public routes working when accept-language contains only wildcard tokens', async () => {
    const request = new NextRequest('https://teach.tuturuuu.com/login', {
      headers: {
        'accept-language': '*',
      },
    });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.status).toBe(200);
  });

  it('consumes verify-token requests before rendering the public verifier page', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://teach.tuturuuu.com/dashboard'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);
    const request = new NextRequest(
      'https://teach.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fdashboard'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/logout',
    '/api/auth/refresh-app-session',
    '/api/auth/verify-app-token',
  ])('returns guard responses for %s before local route handling', async (pathname) => {
    const guardResponse = NextResponse.json(
      { error: 'Payload Too Large' },
      { status: 413 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);
    const request = new NextRequest(`https://teach.tuturuuu.com${pathname}`, {
      body: '{}',
      headers: { 'content-length': '524289' },
      method: 'POST',
    });

    const response = await proxy(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload Too Large',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:teach:api',
    });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      guardResponse
    );
  });

  it('continues to local auth API routes when the guard allows the request', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    const request = new NextRequest(
      'https://teach.tuturuuu.com/api/auth/verify-app-token',
      {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:teach:api',
    });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      response
    );
  });
});
