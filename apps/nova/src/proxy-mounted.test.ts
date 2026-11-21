import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  mountedNovaAuth: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  resolveMountedNovaSession: vi.fn(),
}));

vi.mock('./lib/mounted-auth', async (actual) => ({
  ...(await actual<typeof import('./lib/mounted-auth')>()),
  mountedNovaAuth: (...args: Parameters<typeof mocks.mountedNovaAuth>) =>
    mocks.mountedNovaAuth(...args),
  resolveMountedNovaSession: (
    ...args: Parameters<typeof mocks.resolveMountedNovaSession>
  ) => mocks.resolveMountedNovaSession(...args),
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
  new NextRequest(`https://tuturuuu.com/nova${path}`, {
    ...init,
    nextConfig: { basePath: '/nova' },
  });

describe('Nova proxy on the tuturuuu.com/nova mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.mountedNovaAuth.mockResolvedValue(NextResponse.next());
    mocks.resolveMountedNovaSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('authenticates pages with the shared session, never a Nova refresh', async () => {
    await proxy(based('/en/personal/nova'));

    expect(mocks.mountedNovaAuth).toHaveBeenCalledOnce();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('hands verify-token to the mounted session, not the token exchange', async () => {
    mocks.mountedNovaAuth.mockResolvedValueOnce(
      NextResponse.redirect('https://tuturuuu.com/nova/en/personal/nova')
    );

    const response = await proxy(based('/verify-token?nextUrl=%2F'));

    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/nova/en/personal/nova'
    );
  });

  it('reads API sessions from the shared session without refreshing', async () => {
    await proxy(
      based('/api/v1/nova', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.resolveMountedNovaSession).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('rejects a mounted API request whose shared session expired', async () => {
    mocks.resolveMountedNovaSession.mockResolvedValueOnce({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await proxy(based('/api/v1/nova'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps the subdomain on the Nova app-session refresh', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(
      new NextRequest('https://nova.tuturuuu.com/api/v1/nova', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.resolveMountedNovaSession).not.toHaveBeenCalled();
  });
});
