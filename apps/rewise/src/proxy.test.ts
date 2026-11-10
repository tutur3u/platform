import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guardApiProxyRequest: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_req: unknown, res: unknown) => res,
  getAppSessionClaimsFromRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  appSessionFailureResponse: () =>
    new Response('unauthorized', { status: 401 }),
  consumeVerifyTokenRequest: vi.fn(),
  createCentralizedAuthProxy: () => vi.fn(),
  getRequestHeadersWithResponseCookies: vi.fn(),
  preserveMfaRecoveryCookies: (_req: unknown, res: unknown) => res,
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: mocks.refreshAppSessionForRequest,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/accept-language', () => ({
  negotiateAcceptLanguage: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guardApiProxyRequest,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn() }));

describe('rewise proxy build identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'unauthorized',
      ok: false,
      response: new Response('unauthorized', { status: 401 }),
    });
  });

  it.each(['GET', 'HEAD'])(
    'admits an anonymous %s /api/build-info without a session check',
    async (method) => {
      const { proxy } = await import('./proxy');
      const response = await proxy(
        new NextRequest('https://rewise.tuturuuu.com/api/build-info', {
          headers: { authorization: 'Bearer x', cookie: 'a=b' },
          method,
        })
      );
      expect(response.status).toBe(200);
      expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
      expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
    }
  );

  it('applies the API rate limit to the build identity', async () => {
    mocks.guardApiProxyRequest.mockResolvedValueOnce(
      new Response('limited', { status: 429 })
    );
    const { proxy } = await import('./proxy');
    const response = await proxy(
      new NextRequest('https://rewise.tuturuuu.com/api/build-info')
    );
    expect(response.status).toBe(429);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('keeps other API routes behind the session check', async () => {
    const { proxy } = await import('./proxy');
    const response = await proxy(
      new NextRequest('https://rewise.tuturuuu.com/api/v1/chats')
    );
    expect(response.status).toBe(401);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
  });

  it('does not exempt a write to the build identity path', async () => {
    const { proxy } = await import('./proxy');
    const response = await proxy(
      new NextRequest('https://rewise.tuturuuu.com/api/build-info', {
        method: 'POST',
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
  });
});
