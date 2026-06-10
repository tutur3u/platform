import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  getAppSessionClaimsFromRequest: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionClaimsFromRequest>
  ) => mocks.getAppSessionClaimsFromRequest(...args),
  hasSupportedSupabaseAuthCookie: (
    ...args: Parameters<typeof mocks.hasSupportedSupabaseAuthCookie>
  ) => mocks.hasSupportedSupabaseAuthCookie(...args),
  hasWebAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.hasWebAppSessionTokenFromRequest>
  ) => mocks.hasWebAppSessionTokenFromRequest(...args),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

function appSessionClaims(): AppCoordinationTokenClaims {
  return {
    aud: 'tuturuuu-api',
    email: 'local@tuturuuu.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: 'tuturuuu',
    jti: 'jti',
    origin_app: 'web',
    scopes: ['internal-app:session'],
    sub: '00000000-0000-0000-0000-000000000001',
    target_app: 'chat',
    typ: 'app_coordination',
  };
}

describe('Chat proxy auth handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  it('consumes verify-token requests before public verifier rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://chat.tuturuuu.localhost/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://chat.tuturuuu.localhost/verify-token?token=copy-token&nextUrl=%2Fpersonal'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('sends stale local-only app sessions back through the local login recovery path', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValueOnce(false);
    const request = new NextRequest('https://chat.tuturuuu.localhost/personal');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://chat.tuturuuu.localhost/login?next=%2Fpersonal'
    );
  });

  it('sends unauthenticated production protected pages to the local Chat login handoff', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      claims: null,
      ok: false,
      refreshed: false,
      response: NextResponse.next(),
    });
    const request = new NextRequest('https://chat.tuturuuu.com/personal');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBe(
      'https://chat.tuturuuu.com/login?next=%2Fpersonal'
    );
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'chat',
    });
  });

  it('allows protected pages when both local and Web app-session cookies are present', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValueOnce(true);
    const request = new NextRequest('https://chat.tuturuuu.localhost/personal');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows protected pages with a shared Supabase session', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValueOnce({
      claims: appSessionClaims(),
      ok: true,
      refreshed: false,
      response: NextResponse.next(),
    });
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValueOnce(true);
    const request = new NextRequest('https://chat.tuturuuu.localhost/personal');

    const response = await proxy(request);

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'chat',
    });
  });
});
