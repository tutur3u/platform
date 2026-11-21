import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  mountedTeachAuth: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  resolveMountedTeachSession: vi.fn(),
}));

vi.mock('./lib/mounted-auth', async (actual) => ({
  ...(await actual<typeof import('./lib/mounted-auth')>()),
  mountedTeachAuth: (...args: Parameters<typeof mocks.mountedTeachAuth>) =>
    mocks.mountedTeachAuth(...args),
  resolveMountedTeachSession: (
    ...args: Parameters<typeof mocks.resolveMountedTeachSession>
  ) => mocks.resolveMountedTeachSession(...args),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: NextRequest, response: NextResponse) =>
    response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => true,
  hasWebAppSessionTokenFromRequest: () => false,
}));

vi.mock('@tuturuuu/auth/proxy', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/auth/proxy')>()),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: () => mocks.authProxy,
  getRequestHeadersWithResponseCookies: () => new Headers(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: () => false,
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { proxy } from './proxy';

const based = (path: string, init?: { headers?: HeadersInit }) =>
  new NextRequest(`https://tuturuuu.com/teach${path}`, {
    ...init,
    nextConfig: { basePath: '/teach' },
  });

describe('Teach proxy on the tuturuuu.com/teach mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.mountedTeachAuth.mockResolvedValue(NextResponse.next());
    mocks.resolveMountedTeachSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('authenticates pages with the shared session, never a Teach refresh', async () => {
    await proxy(based('/en/personal/teach'));

    expect(mocks.mountedTeachAuth).toHaveBeenCalledOnce();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('hands verify-token to the mounted session, not the token exchange', async () => {
    mocks.mountedTeachAuth.mockResolvedValueOnce(
      NextResponse.redirect('https://tuturuuu.com/teach/en/personal/teach')
    );

    const response = await proxy(based('/verify-token?nextUrl=%2F'));

    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/teach/en/personal/teach'
    );
  });

  it('reads API sessions from the shared session without refreshing', async () => {
    await proxy(
      based('/api/v1/teach', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.resolveMountedTeachSession).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('rejects a mounted API request whose shared session expired', async () => {
    mocks.resolveMountedTeachSession.mockResolvedValueOnce({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await proxy(based('/api/v1/teach'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps the subdomain on the Teach app-session refresh', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(
      new NextRequest('https://teach.tuturuuu.com/api/v1/teach', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.resolveMountedTeachSession).not.toHaveBeenCalled();
  });
});
