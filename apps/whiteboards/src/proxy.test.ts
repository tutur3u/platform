import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  createCentralizedAuthProxy: vi.fn(),
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
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));

vi.mock('@tuturuuu/auth/proxy', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/auth/proxy')>()),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => {
    mocks.createCentralizedAuthProxy(...args);
    return mocks.authProxy;
  },
  createMountedAppAuth: () => ({
    isMounted: () => false,
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
  getCurrentUserDefaultWorkspace: vi.fn(),
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

import { config, proxy } from './proxy';

// Captured at import time: the proxy builds its auth middleware once.
const authProxyOptions = mocks.createCentralizedAuthProxy.mock.calls[0]?.[0];

const matcherSource = config.matcher[0] as string;
const matchesProxy = (pathname: string) =>
  new RegExp(`^${matcherSource}$`, 'u').test(pathname);

const BOARD_ID = '33333333-3333-4333-8333-333333333333';
const request = (path: string) =>
  new NextRequest(`https://whiteboards.tuturuuu.com${path}`);

describe('Whiteboards proxy matcher', () => {
  it.each([
    '/',
    '/en',
    '/en/personal',
    `/en/personal/${BOARD_ID}`,
    '/api/v1/workspaces/personal/whiteboards',
    '/verify-token',
    '/login',
  ])('runs the proxy for %s', (pathname) => {
    expect(matchesProxy(pathname)).toBe(true);
  });

  it.each([
    `/en/personal/${BOARD_ID}.png`,
    `/en/personal/${BOARD_ID}.svg`,
    `/en/personal/${BOARD_ID}.jpg`,
    `/en/personal/${BOARD_ID}.jpeg`,
    `/en/personal/${BOARD_ID}.gif`,
    `/en/personal/${BOARD_ID}.webp`,
    `/en/personal/${BOARD_ID}.pdf`,
    '/en/personal/board.PNG',
    '/en/personal/favicon.ico',
    '/en/personal/robots.txt',
    '/en/personal/apple-touch-icon.png',
    '/en/personal/media/logo.png',
    '/favicon.ico.png',
    '/robots.txt.png',
    '/_nextx/static/chunk.js',
    '/media-private/board.png',
    '/api/v1/whiteboards/board.png',
  ])('never lets an asset suffix skip the proxy for %s', (pathname) => {
    expect(matchesProxy(pathname)).toBe(true);
  });

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/monitoring',
    '/media/logos/whiteboards.png',
    '/media/background/placeholder.jpg',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/site.webmanifest',
    '/apple-touch-icon.png',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
  ])('leaves the shipped public file %s outside the proxy', (pathname) => {
    expect(matchesProxy(pathname)).toBe(false);
  });
});

describe('Whiteboards proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.authProxy.mockResolvedValue(NextResponse.next());
  });

  it('builds the auth middleware for the whiteboards app with no board path public', () => {
    expect(authProxyOptions).toMatchObject({
      appSession: { targetApp: 'whiteboards' },
      mfa: { enabled: false },
    });
    const board = `/en/personal/${BOARD_ID}`;
    for (const publicPath of authProxyOptions.publicPaths as string[]) {
      expect(board === publicPath || board.startsWith(`${publicPath}/`)).toBe(
        false
      );
    }
  });

  it.each([
    `/en/personal/${BOARD_ID}`,
    '/en/personal',
    `/en/personal/${BOARD_ID}.png`,
  ])('sends a signed-out visitor to %s to the login redirect', async (path) => {
    const login = NextResponse.redirect(
      `https://tuturuuu.com/login?returnUrl=${encodeURIComponent(path)}`
    );
    mocks.authProxy.mockResolvedValueOnce(login);

    const response = await proxy(request(path));

    expect(mocks.authProxy).toHaveBeenCalledOnce();
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain(
      'https://tuturuuu.com/login'
    );
  });

  it('does not touch the session for the public build identity', async () => {
    const response = await proxy(request('/api/build-info'));

    expect(response.status).toBe(200);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('refreshes and guards other API requests', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    await proxy(request('/api/v1/workspaces/personal/whiteboards'));

    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledOnce();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
  });
});
