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
  hasSupportedSupabaseAuthCookie: () => false,
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
import { findSessionlessApiRoute } from './sessionless-api';

const AMBIENT = { authorization: 'Bearer user-token', cookie: 'sb-x=1' };

function subdomain(method: string, path: string) {
  return new NextRequest(`https://tasks.tuturuuu.com${path}`, {
    method,
    headers: AMBIENT,
  });
}

function mounted(method: string, path: string) {
  return new NextRequest(`https://tuturuuu.com/tasks${path}`, {
    method,
    headers: AMBIENT,
    nextConfig: { basePath: '/tasks' },
  });
}

describe('Tasks proxy sessionless API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    mocks.resolveMountedTasksSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it.each([
    ['POST', '/api/v1/ci/alerts'],
    ['POST', '/api/v1/webhooks/tasks/embedding'],
  ])(
    '%s %s skips the session and drops ambient identity',
    async (method, path) => {
      for (const request of [subdomain(method, path), mounted(method, path)]) {
        await proxy(request);
        expect(request.headers.has('cookie')).toBe(false);
        expect(request.headers.has('authorization')).toBe(false);
      }
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.resolveMountedTasksSession).not.toHaveBeenCalled();
      // The abuse guard and rate limits still apply.
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    ['GET', '/api/v1/ci/alerts'],
    ['POST', '/api/v1/ci/alerts/'],
    ['POST', '/api/v1/ci/alerts/extra'],
    ['POST', '/api/v1/ci/%61lerts'],
  ])('%s %s still takes the session path', async (method, path) => {
    const request = subdomain(method, path);
    await proxy(request);

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(request.headers.has('cookie')).toBe(true);
  });

  it.each([['/api/cron/tasks/cleanup-media']])(
    'GET %s keeps its CRON_SECRET bearer without a session',
    async (path) => {
      for (const request of [subdomain('GET', path), mounted('GET', path)]) {
        await proxy(request);
        expect(request.headers.has('cookie')).toBe(false);
        expect(request.headers.get('authorization')).toBe('Bearer user-token');
      }
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.resolveMountedTasksSession).not.toHaveBeenCalled();
    }
  );

  it('matches only exact paths and methods', () => {
    expect(findSessionlessApiRoute('/api/v1/ci/alerts', 'POST')).not.toBeNull();
    expect(findSessionlessApiRoute('/api/v1/ci/alerts', 'PUT')).toBeNull();
    expect(findSessionlessApiRoute('/api/v1/ci/alerts/', 'POST')).toBeNull();
    expect(findSessionlessApiRoute('/api/build-info', 'HEAD')).not.toBeNull();
    expect(findSessionlessApiRoute('/api/build-info', 'POST')).toBeNull();
    expect(
      findSessionlessApiRoute('/api/cron/tasks/cleanup-media', 'POST')
    ).toBeNull();
    expect(
      findSessionlessApiRoute('/api/v1/webhooks/tasks/embedding', 'GET')
    ).toBeNull();
  });
});
