import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  mountedAuth: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  resolveSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/auth/app-session')>()),
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
  createMountedAppAuth: () => ({
    isMounted: (req: NextRequest) =>
      req.nextUrl.origin === 'https://tuturuuu.com' &&
      Boolean(req.nextUrl.basePath),
    auth: mocks.mountedAuth,
    resolveSession: mocks.resolveSession,
  }),
  getRequestHeadersWithResponseCookies: () => new Headers(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  withForwardedInternalApiAuth: () => ({}),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: () => false,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/navigation', () => ({ createNavigation: () => ({}) }));

import { proxy } from './proxy';

const based = (path: string, init?: { headers?: HeadersInit }) =>
  new NextRequest(`https://tuturuuu.com/ai${path}`, {
    ...init,
    nextConfig: { basePath: '/ai' },
  });

describe('Ai proxy on the tuturuuu.com/ai mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.mountedAuth.mockResolvedValue(NextResponse.next());
    mocks.resolveSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('authenticates pages with the shared session, never a Ai refresh', async () => {
    await proxy(based('/en/personal/ai'));

    expect(mocks.mountedAuth).toHaveBeenCalledOnce();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('hands verify-token to the mounted session, not the token exchange', async () => {
    mocks.mountedAuth.mockResolvedValueOnce(
      NextResponse.redirect('https://tuturuuu.com/ai/en/personal/ai')
    );

    const response = await proxy(based('/verify-token?nextUrl=%2F'));

    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/ai/en/personal/ai'
    );
  });

  it('reads API sessions from the shared session without refreshing', async () => {
    await proxy(
      based('/api/v1/ai', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.resolveSession).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('rejects a mounted API request whose shared session expired', async () => {
    mocks.resolveSession.mockResolvedValueOnce({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await proxy(based('/api/v1/ai'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps the subdomain on the Ai app-session refresh', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(
      new NextRequest('https://ai.tuturuuu.com/api/v1/ai', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.resolveSession).not.toHaveBeenCalled();
  });
});
