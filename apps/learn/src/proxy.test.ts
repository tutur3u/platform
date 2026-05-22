import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
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

describe('Learn proxy local auth API guard', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
    const request = new NextRequest(`https://learn.tuturuuu.com${pathname}`, {
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
      prefixBase: 'proxy:learn:api',
    });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      guardResponse
    );
  });

  it('continues to local auth API routes when the guard allows the request', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    const request = new NextRequest(
      'https://learn.tuturuuu.com/api/auth/verify-app-token',
      {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:learn:api',
    });
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledWith(
      request,
      response
    );
  });
});
