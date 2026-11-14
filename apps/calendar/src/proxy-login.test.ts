import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const CALENDAR_ORIGIN = 'https://calendar.tuturuuu.com';
const CENTRAL_ORIGIN = 'https://tuturuuu.com';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  getAppSessionClaimsFromRequest: vi.fn(),
  getCurrentUserDefaultWorkspace: vi.fn(),
  getRequestHeadersWithResponseCookies: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasAuthenticatedBearerToken: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
  isTrustedProxyBypassRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('./constants/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./constants/common')>()),
  BASE_URL: 'https://calendar.tuturuuu.com',
  TTR_URL: 'https://tuturuuu.com',
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

// The real normalizeAuthRedirectPath stays in place so hostile next values are
// exercised end to end.
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: () => mocks.authProxy,
  getRequestHeadersWithResponseCookies: (
    ...args: Parameters<typeof mocks.getRequestHeadersWithResponseCookies>
  ) => mocks.getRequestHeadersWithResponseCookies(...args),
  propagateAuthCookies: (
    ...args: Parameters<typeof mocks.propagateAuthCookies>
  ) => mocks.propagateAuthCookies(...args),
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getCurrentUserDefaultWorkspace>
  ) => mocks.getCurrentUserDefaultWorkspace(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedBearerToken: (
    ...args: Parameters<typeof mocks.hasAuthenticatedBearerToken>
  ) => mocks.hasAuthenticatedBearerToken(...args),
  isTrustedProxyBypassRequest: (
    ...args: Parameters<typeof mocks.isTrustedProxyBypassRequest>
  ) => mocks.isTrustedProxyBypassRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

function centralLoginFor(nextPath: string) {
  const returnUrl = new URL('/verify-token', CALENDAR_ORIGIN);
  returnUrl.searchParams.set('nextUrl', nextPath);
  const loginUrl = new URL('/login', CENTRAL_ORIGIN);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  return loginUrl.toString();
}

function returnUrlOf(response: Response) {
  const location = new URL(response.headers.get('location') ?? '');
  expect(`${location.origin}${location.pathname}`).toBe(
    `${CENTRAL_ORIGIN}/login`
  );
  expect(location.searchParams.getAll('returnUrl')).toHaveLength(1);
  expect([...location.searchParams.keys()]).toEqual(['returnUrl']);
  return new URL(location.searchParams.get('returnUrl') ?? '');
}

describe('Calendar proxy signed-out login handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authProxy.mockReturnValue(NextResponse.next());
    mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
    mocks.getAppSessionClaimsFromRequest.mockReturnValue(null);
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValue(null);
    mocks.getRequestHeadersWithResponseCookies.mockReturnValue(new Headers());
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedBearerToken.mockReturnValue(false);
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(false);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    mocks.refreshAppSessionForRequest.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it.each(['/login', '/en/login', '/vi/login', '/login/', '/en/login/'])(
    'answers a signed-out GET %s with an uncached 307 to central sign-in',
    async (path) => {
      const response = await proxy(
        new NextRequest(`${CALENDAR_ORIGIN}${path}?nextUrl=%2Fpersonal`)
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        centralLoginFor('/personal')
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
      const returnUrl = returnUrlOf(response);
      expect(returnUrl.origin).toBe(CALENDAR_ORIGIN);
      expect(returnUrl.pathname).toBe('/verify-token');
      expect(returnUrl.searchParams.has('token')).toBe(false);
    }
  );

  it('answers a signed-out HEAD the same way', async () => {
    const response = await proxy(
      new NextRequest(`${CALENDAR_ORIGIN}/login`, { method: 'HEAD' })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(centralLoginFor('/personal'));
  });

  it('keeps a same-origin deep link as the next path', async () => {
    const response = await proxy(
      new NextRequest(
        `${CALENDAR_ORIGIN}/login?next=${encodeURIComponent('/personal/tasks?view=week')}`
      )
    );

    expect(response.headers.get('location')).toBe(
      centralLoginFor('/personal/tasks?view=week')
    );
  });

  it.each([
    '//evil.example/x',
    '/\\evil.example/x',
    '%2F%2Fevil.example%2Fx',
    'javascript:alert(1)',
    'https://evil.example/x',
  ])('collapses hostile next %s to an on-origin path', async (hostile) => {
    const response = await proxy(
      new NextRequest(
        `${CALENDAR_ORIGIN}/login?nextUrl=${encodeURIComponent(hostile)}`
      )
    );

    expect(response.status).toBe(307);
    const returnUrl = returnUrlOf(response);
    expect(returnUrl.origin).toBe(CALENDAR_ORIGIN);
    const nextPath = returnUrl.searchParams.get('nextUrl') ?? '';
    expect(nextPath.startsWith('/')).toBe(true);
    expect(nextPath).not.toContain('evil.example');
    expect(new URL(nextPath, CALENDAR_ORIGIN).origin).toBe(CALENDAR_ORIGIN);
  });

  it('treats a stale Supabase cookie as signed out and clears only that session', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);

    const response = await proxy(new NextRequest(`${CALENDAR_ORIGIN}/login`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(centralLoginFor('/personal'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalledTimes(1);
    expect(mocks.propagateAuthCookies).not.toHaveBeenCalled();
  });

  it('treats a Web session cookie without verified claims as signed out', async () => {
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);

    const response = await proxy(new NextRequest(`${CALENDAR_ORIGIN}/login`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(centralLoginFor('/personal'));
    expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
  });

  it('keeps the signed-in branch for a verified session', async () => {
    mocks.getAppSessionClaimsFromRequest.mockReturnValue({ sub: 'user-1' });
    mocks.hasWebAppSessionTokenFromRequest.mockReturnValue(true);

    const response = await proxy(
      new NextRequest(`${CALENDAR_ORIGIN}/login?nextUrl=%2Fpersonal`)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${CALENDAR_ORIGIN}/personal`
    );
  });

  it('does not answer non-GET or non-login paths', async () => {
    for (const request of [
      new NextRequest(`${CALENDAR_ORIGIN}/login`, { method: 'POST' }),
      new NextRequest(`${CALENDAR_ORIGIN}/login/extra`),
      new NextRequest(`${CALENDAR_ORIGIN}/en/loginx`),
    ]) {
      const response = await proxy(request);
      expect(response.headers.get('location') ?? '').not.toContain(
        `${CENTRAL_ORIGIN}/login`
      );
    }
  });

  it('leaves the mounted apex login unchanged', async () => {
    const response = await proxy(
      new NextRequest(`${CENTRAL_ORIGIN}/calendar/login`, {
        nextConfig: { basePath: '/calendar' },
      })
    );

    expect(response.headers.get('location') ?? '').not.toContain(
      `${CENTRAL_ORIGIN}/login?returnUrl`
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });
});
