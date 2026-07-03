import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  default: () => (request: NextRequest) => {
    const [firstSegment] = request.nextUrl.pathname.split('/').filter(Boolean);

    if (firstSegment === 'en' || firstSegment === 'vi') {
      return NextResponse.next();
    }

    const redirectUrl = new URL(request.url);
    redirectUrl.pathname =
      request.nextUrl.pathname === '/'
        ? '/en'
        : `/en${request.nextUrl.pathname}`;

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('NEXT_LOCALE', 'en');
    return response;
  },
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

describe('Infra proxy', () => {
  beforeEach(() => {
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes protected API requests for the infra app before web proxy fallback', async () => {
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/api/v1/infrastructure/monitoring/cron'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:infra:api',
    });
  });

  it('guards local auth API routes without refreshing an app session first', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Payload Too Large' },
      { status: 413 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/api/auth/verify-app-token',
      {
        body: '{}',
        headers: { 'content-length': '524289' },
        method: 'POST',
      }
    );

    const response = await proxy(request);

    expect(response.status).toBe(413);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(request, {
      prefixBase: 'proxy:infra:api',
    });
  });

  it('redirects unauthenticated pages to the infra login page', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      error: 'Missing app session',
      ok: false,
    });

    const request = new NextRequest(
      'https://infra.tuturuuu.localhost/personal'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infra.tuturuuu.localhost/login?next=%2Fpersonal'
    );
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(request, {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'infra',
    });
  });

  it('lets next-intl localize unlocalized public login paths', async () => {
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/login?next=%2F'
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://infrastructure.tuturuuu.com/en/login?next=%2F'
    );
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it('does not canonicalize localized public login paths back to unlocalized login', async () => {
    const request = new NextRequest(
      'https://infrastructure.tuturuuu.com/en/login?next=%2F'
    );

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unlocalized',
      'https://infrastructure.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fpersonal',
    ],
    [
      'localized',
      'https://infrastructure.tuturuuu.com/en/verify-token?token=copy-token&nextUrl=%2Fpersonal',
    ],
  ])('consumes %s verify-token requests before page auth redirects', async (_label, url) => {
    const verifyResponse = NextResponse.redirect(
      'https://infrastructure.tuturuuu.com/personal'
    );
    mocks.consumeVerifyTokenRequest.mockResolvedValue(verifyResponse);

    const request = new NextRequest(url);

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  });
});
