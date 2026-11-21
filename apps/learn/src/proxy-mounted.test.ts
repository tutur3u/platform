import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  mountedLearnAuth: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  resolveMountedLearnSession: vi.fn(),
}));

vi.mock('./lib/mounted-auth', async (actual) => ({
  ...(await actual<typeof import('./lib/mounted-auth')>()),
  mountedLearnAuth: (...args: Parameters<typeof mocks.mountedLearnAuth>) =>
    mocks.mountedLearnAuth(...args),
  resolveMountedLearnSession: (
    ...args: Parameters<typeof mocks.resolveMountedLearnSession>
  ) => mocks.resolveMountedLearnSession(...args),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  verifyAppSessionRequestWithToken: () => null,
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
  new NextRequest(`https://tuturuuu.com/learn${path}`, {
    ...init,
    nextConfig: { basePath: '/learn' },
  });

describe('Learn proxy on the tuturuuu.com/learn mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.mountedLearnAuth.mockResolvedValue(NextResponse.next());
    mocks.resolveMountedLearnSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('authenticates pages with the shared session, never a Learn refresh', async () => {
    await proxy(based('/en/personal/learn'));

    expect(mocks.mountedLearnAuth).toHaveBeenCalledOnce();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('hands verify-token to the mounted session, not the token exchange', async () => {
    mocks.mountedLearnAuth.mockResolvedValueOnce(
      NextResponse.redirect('https://tuturuuu.com/learn/en/personal/learn')
    );

    const response = await proxy(based('/verify-token?nextUrl=%2F'));

    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/learn/en/personal/learn'
    );
  });

  it('reads API sessions from the shared session without refreshing', async () => {
    await proxy(
      based('/api/v1/learn', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.resolveMountedLearnSession).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('rejects a mounted API request whose shared session expired', async () => {
    mocks.resolveMountedLearnSession.mockResolvedValueOnce({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await proxy(based('/api/v1/learn'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps the subdomain on the Learn app-session refresh', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(
      new NextRequest('https://learn.tuturuuu.com/api/v1/learn', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.resolveMountedLearnSession).not.toHaveBeenCalled();
  });
});

describe('Learn LMS mount', () => {
  it.each(['/personal/courses', '/api/v1/tulearn/courses'])(
    'never refreshes %s',
    async (path) => {
      vi.clearAllMocks();
      mocks.mountedLearnAuth.mockResolvedValue(NextResponse.next());
      mocks.resolveMountedLearnSession.mockResolvedValue({
        ok: true,
        response: NextResponse.next(),
      });
      await proxy(
        new NextRequest(`https://tuturuuu.com/lms/learn${path}`, {
          nextConfig: { basePath: '/lms/learn' },
        })
      );
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(
        mocks.mountedLearnAuth.mock.calls.length +
          mocks.resolveMountedLearnSession.mock.calls.length
      ).toBe(1);
    }
  );
});
