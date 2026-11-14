import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './app/[locale]/(auth)/login/page';
import { centralCalendarLoginUrl } from './lib/central-login';
import { proxy } from './proxy';

const APEX = 'https://tuturuuu.com';
const BASE = '/calendar';
const SHARED_COOKIE = 'sb-fixture-auth-token=shared';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  clearSupabaseAuthCookies: vi.fn(
    (_request: NextRequest, response: NextResponse) => response
  ),
  consumeVerifyTokenRequest: vi.fn(),
  getSatelliteAppSession: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (
    ...args: Parameters<typeof mocks.clearSupabaseAuthCookies>
  ) => mocks.clearSupabaseAuthCookies(...args),
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: (
    ...args: Parameters<typeof mocks.hasSupportedSupabaseAuthCookie>
  ) => mocks.hasSupportedSupabaseAuthCookie(...args),
  hasWebAppSessionTokenFromRequest: () => false,
}));

// Redirect-path validation, cookie propagation and request header merging stay
// real so the assertions cover the shipped same-origin checks.
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: () => mocks.authProxy,
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(async () => false),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: (
    ...args: Parameters<typeof mocks.getSatelliteAppSession>
  ) => mocks.getSatelliteAppSession(...args),
}));

vi.mock('next/headers', () => ({
  headers: () => mocks.headers(),
}));

vi.mock('next/navigation', async () => ({
  ...(await vi.importActual<typeof import('next/navigation')>(
    'next/navigation'
  )),
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

// The production apex artifact resolves BASE_URL to the mounted app URL.
vi.mock('@/constants/common', async () => ({
  ...(await vi.importActual<typeof import('@/constants/common')>(
    '@/constants/common'
  )),
  BASE_URL: 'https://tuturuuu.com/calendar',
  TTR_URL: 'https://tuturuuu.com',
}));

function mounted(
  pathAndQuery: string,
  init: { method?: string; cookie?: string } = {}
) {
  return new NextRequest(`${APEX}${pathAndQuery}`, {
    method: init.method ?? 'GET',
    headers: init.cookie ? { cookie: init.cookie } : undefined,
    nextConfig: { basePath: BASE },
  });
}

function verifyTokenUrl(params: Record<string, string>, path = '') {
  return `${BASE}${path}/verify-token?${new URLSearchParams(params)}`;
}

/** Renders the mounted login page and returns the URL it redirects to. */
async function renderMountedLogin(
  searchParams: Record<string, string>,
  cookie?: string
) {
  const request = new Request(
    `${APEX}${BASE}/login?${new URLSearchParams(searchParams)}`,
    { headers: cookie ? { cookie } : undefined }
  );
  mocks.headers.mockResolvedValue(request.headers);
  const outcome = await withBridgeRequest({ request, appBase: BASE }, () =>
    LoginPage({ searchParams: Promise.resolve(searchParams) })
  ).then(
    () => new Error('Login page rendered without redirecting'),
    (error: unknown) => error
  );
  if (!(outcome instanceof Error) || !outcome.message.startsWith('redirect:'))
    throw outcome;
  return outcome.message.slice('redirect:'.length);
}

function expectNoSessionWrites(response: Response) {
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(mocks.consumeVerifyTokenRequest).not.toHaveBeenCalled();
  expect(mocks.authProxy).not.toHaveBeenCalled();
  expect(mocks.refreshAppSessionForRequest).not.toHaveBeenCalled();
  expect(mocks.clearSupabaseAuthCookies).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authProxy.mockReturnValue(NextResponse.next());
  mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
  mocks.getSatelliteAppSession.mockResolvedValue(null);
  mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
  mocks.headers.mockResolvedValue(new Headers());
  mocks.refreshAppSessionForRequest.mockResolvedValue({
    ok: true,
    response: NextResponse.next(),
  });
});

describe('mounted Calendar verify-token resume', () => {
  it('keeps the deep link across the Web sign-in handoff', async () => {
    const login = await proxy(mounted(`${BASE}/login?next=%2Fabc`));
    expect(login.headers.get('location')).toBeNull();

    const handoff = new URL(await renderMountedLogin({ next: '/abc' }));
    expect(`${handoff.origin}${handoff.pathname}`).toBe(`${APEX}/login`);
    const returnUrl = new URL(handoff.searchParams.get('returnUrl') ?? '');
    expect(`${returnUrl.origin}${returnUrl.pathname}`).toBe(
      `${APEX}${BASE}/verify-token`
    );
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/abc');

    // Web signs in, sets the shared apex cookie and returns with a token.
    returnUrl.searchParams.set('token', 'x');
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    const resume = await proxy(
      mounted(`${returnUrl.pathname}${returnUrl.search}`, {
        cookie: SHARED_COOKIE,
      })
    );

    expect(resume.status).toBe(307);
    expect(resume.headers.get('location')).not.toBe(`${APEX}${BASE}/login`);
    expect(resume.headers.get('location')).toBe(`${APEX}${BASE}/abc`);
    expectNoSessionWrites(resume);
  });

  it.each([
    ['GET', ''],
    ['HEAD', ''],
    ['GET', '/en'],
    ['HEAD', '/vi'],
  ])(
    '%s %s/verify-token resumes without consuming the token',
    async (method, locale) => {
      for (const trailing of ['', '/']) {
        const path = verifyTokenUrl({ token: 'x', nextUrl: '/abc' }, locale);
        const response = await proxy(
          mounted(path.replace('/verify-token?', `/verify-token${trailing}?`), {
            method,
            cookie: SHARED_COOKIE,
          })
        );
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(`${APEX}${BASE}/abc`);
        expectNoSessionWrites(response);
      }
    }
  );

  it('preserves a valid workspace path with its query', async () => {
    const response = await proxy(
      mounted(
        verifyTokenUrl({
          token: 'x',
          nextUrl: '/ws-id/calendar?date=2026-11-14',
        })
      )
    );
    expect(response.headers.get('location')).toBe(
      `${APEX}${BASE}/ws-id/calendar?date=2026-11-14`
    );
    expectNoSessionWrites(response);
  });

  it('accepts `next` when `nextUrl` is absent', async () => {
    const response = await proxy(
      mounted(verifyTokenUrl({ token: 'x', next: '/abc' }))
    );
    expect(response.headers.get('location')).toBe(`${APEX}${BASE}/abc`);
  });

  it('drops a token nested in a verify-token next path', async () => {
    const response = await proxy(
      mounted(
        verifyTokenUrl({
          token: 'x',
          nextUrl: '/verify-token?token=nested&nextUrl=%2Fabc',
        })
      )
    );
    expect(response.headers.get('location')).toBe(`${APEX}${BASE}/abc`);
    expectNoSessionWrites(response);
  });

  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/x',
    '%2F%2Fevil.example',
    '/%5Cevil.example',
    'javascript:alert(1)',
    '',
  ])(
    'sends the hostile next path %j to /calendar/personal',
    async (nextUrl) => {
      const response = await proxy(
        mounted(verifyTokenUrl({ token: 'x', nextUrl }))
      );
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${APEX}${BASE}/personal`);
      expectNoSessionWrites(response);
    }
  );

  it('falls back to /calendar/personal without a next path', async () => {
    const response = await proxy(mounted(verifyTokenUrl({ token: 'x' })));
    expect(response.headers.get('location')).toBe(`${APEX}${BASE}/personal`);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'returns %s to the mounted login without consuming the token',
    async (method) => {
      const response = await proxy(
        mounted(verifyTokenUrl({ token: 'x', nextUrl: '/abc' }), {
          method,
          cookie: SHARED_COOKIE,
        })
      );
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${APEX}${BASE}/login`);
      expectNoSessionWrites(response);
    }
  );

  it.each([
    '/verify-token-extra',
    '/verify-token/abc',
    '/fr/verify-token',
    '/en/en/verify-token',
    '/xverify-token',
    '/abc/verify-token',
  ])('does not treat %s as the verify-token resume', async (path) => {
    const response = await proxy(
      mounted(`${BASE}${path}?token=x&nextUrl=%2Fabc`)
    );
    expect(response.headers.get('location')).toBeNull();
    expectNoSessionWrites(response);
  });
});

describe('mounted Calendar login with a stale shared cookie', () => {
  beforeEach(() => {
    // The cookie name is present, but the session behind it no longer verifies.
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    mocks.getSatelliteAppSession.mockResolvedValue(null);
  });

  it.each(['/login', '/en/login', '/login?next=%2Fpersonal'])(
    'lets the login page decide at %s instead of bouncing to a protected page',
    async (path) => {
      const response = await proxy(
        mounted(`${BASE}${path}`, { cookie: SHARED_COOKIE })
      );
      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
      expectNoSessionWrites(response);
    }
  );

  it('hands a stale session to Web instead of back to /calendar/personal', async () => {
    const target = new URL(await renderMountedLogin({}, SHARED_COOKIE));
    expect(`${target.origin}${target.pathname}`).toBe(`${APEX}/login`);
    expect(target.searchParams.get('returnUrl')).toBe(
      `${APEX}${BASE}/verify-token?nextUrl=%2Fpersonal`
    );
  });

  it('sends a verified session from the mounted login to its next path', async () => {
    mocks.getSatelliteAppSession.mockResolvedValue({ sub: 'user-1' });
    await expect(
      renderMountedLogin({ next: '/abc' }, SHARED_COOKIE)
    ).resolves.toBe(`${BASE}/abc`);
  });
});

describe('Calendar host login short-circuit', () => {
  // A Supabase cookie name without verified app-session claims may be stale,
  // so the host login hands off to central sign-in (keeping the deep link)
  // and clears that cookie instead of short-circuiting to the next path.
  it('hands a cookie-bearing but unverified login on calendar.tuturuuu.com to central sign-in', async () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
    const response = await proxy(
      new NextRequest('https://calendar.tuturuuu.com/login?next=%2Fabc', {
        headers: { cookie: SHARED_COOKIE },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      centralCalendarLoginUrl('/abc').toString()
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.clearSupabaseAuthCookies).toHaveBeenCalled();
  });
});
