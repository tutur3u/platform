import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  getCurrentUserDefaultWorkspace: vi.fn(),
  guardApiProxyRequest: vi.fn(async () => null),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  isPersonalWorkspace: vi.fn(),
  refreshAppSessionForRequest: vi.fn(async () => ({
    ok: true,
    response: NextResponse.next(),
  })),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_req: NextRequest, response: NextResponse) =>
    response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => mocks.hasSupportedSupabaseAuthCookie(),
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: async () => null,
  createCentralizedAuthProxy: () => mocks.authProxy,
  getRequestHeadersWithResponseCookies: () => new Headers(),
  propagateAuthCookies: () => {},
  refreshAppSessionForRequest: mocks.refreshAppSessionForRequest,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: () => mocks.getCurrentUserDefaultWorkspace(),
  withForwardedInternalApiAuth: () => ({}),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guardApiProxyRequest,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: () => mocks.isPersonalWorkspace(),
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

/** Track mounted at `tuturuuu.com/track` (Next basePath). */
const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/track${path}`, {
    nextConfig: { basePath: '/track' },
  });

describe('Track proxy redirects under a basePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.isPersonalWorkspace.mockResolvedValue(false);
  });

  it('keeps the root workspace normalization inside the base', async () => {
    const response = await proxy(
      mounted('/en/00000000-0000-0000-0000-000000000000/history?range=7d')
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/en/internal/history?range=7d'
    );
  });

  it('keeps the personal workspace redirect inside the base', async () => {
    mocks.isPersonalWorkspace.mockResolvedValue(true);

    const response = await proxy(
      mounted('/11111111-1111-4111-8111-111111111111/history')
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/personal/history'
    );
  });

  it('sends the app root to the default workspace inside the base', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue({
      id: 'workspace-1',
      personal: false,
    });

    const response = await proxy(mounted('/'));

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/workspace-1'
    );
  });

  it('falls back to the personal workspace inside the base', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);

    const response = await proxy(mounted('/'));

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/track/personal'
    );
  });

  it('is unchanged at the subdomain root', async () => {
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest('https://track.tuturuuu.com/')
    );

    expect(response.headers.get('location')).toBe(
      'https://track.tuturuuu.com/personal'
    );
  });

  it.each(['*', '*;q=0.5', 'vi-VN,*;q=0.1'])(
    'negotiates a locale for Accept-Language %s instead of failing',
    async (acceptLanguage) => {
      const response = await proxy(
        new NextRequest('https://track.tuturuuu.com/workspace-1/history', {
          headers: { 'accept-language': acceptLanguage },
        })
      );

      expect(response.status).toBeLessThan(500);
    }
  );
});

describe('Track proxy API admission', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['GET', '/api/build-info', false],
    ['HEAD', '/api/build-info', false],
    ['POST', '/api/build-info', true],
    ['GET', '/api/build-info/extra', true],
  ])(
    'build-info admission: %s %s refreshes=%s',
    async (method, path, refreshes) => {
      const request = new NextRequest(`https://track.tuturuuu.com${path}`, {
        method,
        headers: { authorization: 'Bearer x', cookie: 'sb-x=1' },
      });
      await proxy(request);

      expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledTimes(
        refreshes ? 1 : 0
      );
      expect(mocks.guardApiProxyRequest).toHaveBeenCalled();
      expect(request.headers.has('cookie')).toBe(refreshes);
      expect(request.headers.has('authorization')).toBe(refreshes);
    }
  );
});
