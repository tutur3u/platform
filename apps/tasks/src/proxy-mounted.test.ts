import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  mountedTasksAuth: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  resolveMountedTasksSession: vi.fn(),
}));

vi.mock('./lib/mounted-auth', async (actual) => ({
  ...(await actual<typeof import('./lib/mounted-auth')>()),
  mountedTasksAuth: (...args: Parameters<typeof mocks.mountedTasksAuth>) =>
    mocks.mountedTasksAuth(...args),
  resolveMountedTasksSession: (
    ...args: Parameters<typeof mocks.resolveMountedTasksSession>
  ) => mocks.resolveMountedTasksSession(...args),
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

import { proxy } from './proxy';

const based = (path: string, init?: { headers?: HeadersInit }) =>
  new NextRequest(`https://tuturuuu.com/tasks${path}`, {
    ...init,
    nextConfig: { basePath: '/tasks' },
  });

describe('Tasks proxy on the tuturuuu.com/tasks mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.mountedTasksAuth.mockResolvedValue(NextResponse.next());
    mocks.resolveMountedTasksSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('authenticates pages with the shared session, never a Tasks refresh', async () => {
    await proxy(based('/en/personal/tasks'));

    expect(mocks.mountedTasksAuth).toHaveBeenCalledOnce();
    expect(mocks.authProxy).not.toHaveBeenCalled();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('hands verify-token to the mounted session, not the token exchange', async () => {
    mocks.mountedTasksAuth.mockResolvedValueOnce(
      NextResponse.redirect('https://tuturuuu.com/tasks/en/personal/tasks')
    );

    const response = await proxy(based('/verify-token?nextUrl=%2F'));

    expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/en/personal/tasks'
    );
  });

  it('reads API sessions from the shared session without refreshing', async () => {
    await proxy(
      based('/api/v1/tasks', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.resolveMountedTasksSession).toHaveBeenCalledOnce();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('rejects a mounted API request whose shared session expired', async () => {
    mocks.resolveMountedTasksSession.mockResolvedValueOnce({
      ok: false,
      error: 'Shared session unavailable',
    });

    const response = await proxy(based('/api/v1/tasks'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps the subdomain on the Tasks app-session refresh', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(
      new NextRequest('https://tasks.tuturuuu.com/api/v1/tasks', {
        headers: { cookie: 'sb-test-auth-token=shared' },
      })
    );

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.resolveMountedTasksSession).not.toHaveBeenCalled();
  });
});
