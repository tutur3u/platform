import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), guard: vi.fn() }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: mocks.refresh,
  guardApiProxyRequest: mocks.guard,
  appSessionFailureResponse: vi.fn(),
  createCentralizedAuthProxy: () => async () => NextResponse.next(),
  consumeVerifyTokenRequest: async () => null,
  getRequestHeadersWithResponseCookies: vi.fn(),
  propagateAuthCookies: vi.fn(),
  preserveMfaRecoveryCookies: (_request: unknown, response: unknown) =>
    response,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.refresh.mockResolvedValue({ ok: true, response: NextResponse.next() });
});

describe('public deployment identity boundary', () => {
  it.each(['GET', 'HEAD'])(
    'admits exact %s without ambient identity or refresh',
    async (method) => {
      const request = new NextRequest(
        'https://finance.tuturuuu.com/api/build-info',
        {
          method,
          headers: {
            cookie: 'tuturuuu_app_session=expired; fixture=ambient',
            authorization: 'Bearer expired',
          },
        }
      );
      const response = await proxy(request);
      expect(response.status).toBe(200);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.guard).toHaveBeenCalledOnce();
      expect(request.headers.has('authorization')).toBe(false);
      expect(request.headers.has('cookie')).toBe(false);
      expect(request.cookies.getAll()).toEqual([]);
    }
  );

  it.each([
    ['POST', '/api/build-info'],
    ['DELETE', '/api/build-info'],
    ['GET', '/api/build-info/extra'],
    ['GET', '/api/build-information'],
    ['HEAD', '/api/workspaces'],
  ])('retains the guard for %s %s', async (method, pathname) => {
    mocks.guard.mockResolvedValue(
      NextResponse.json({ error: 'denied' }, { status: 401 })
    );
    const response = await proxy(
      new NextRequest(`https://finance.tuturuuu.com${pathname}`, { method })
    );
    expect(response.status).toBe(401);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.guard).toHaveBeenCalledOnce();
  });
});
