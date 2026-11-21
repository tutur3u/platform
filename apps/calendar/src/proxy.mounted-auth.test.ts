import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  resolveMountedSession: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', async (load) => ({
  ...(await load<typeof import('@tuturuuu/auth/app-session')>()),
  clearSupabaseAuthCookies: mocks.clearSupabaseAuthCookies,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: mocks.hasSupportedSupabaseAuthCookie,
}));

vi.mock('@tuturuuu/auth/proxy', async (load) => {
  const actual = await load<typeof import('@tuturuuu/auth/proxy')>();
  return {
    ...actual,
    createCentralizedAuthProxy: () => mocks.authProxy,
    createMountedAppAuth: (
      options: Parameters<typeof actual.createMountedAppAuth>[0]
    ) =>
      actual.createMountedAppAuth(options, {
        resolveMountedSharedSession: mocks.resolveMountedSession,
        consumeMountedSharedSession: actual.consumeMountedSharedSession,
      }),
  };
});

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

function mounted(path: string) {
  return new NextRequest(APEX + BASE + path, {
    nextConfig: { basePath: BASE },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authProxy.mockResolvedValue(NextResponse.next());
  mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
  mocks.resolveMountedSession.mockResolvedValue({
    ok: false,
    error: 'Shared session unavailable',
  });
});

describe('mounted Calendar shared session', () => {
  it('rejects mutation methods at the mounted verifier', async () => {
    const response = await proxy(
      new NextRequest(APEX + BASE + '/vi/verify-token?nextUrl=%2Fpersonal', {
        method: 'POST',
        nextConfig: { basePath: BASE },
      })
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.resolveMountedSession).not.toHaveBeenCalled();
  });

  it('round-trips a signed-out deep link through Web and the mounted verifier', async () => {
    const path = '/personal?view=week&q=one%26two';
    const handoff = await proxy(mounted(path));
    expect(handoff.status).toBe(307);
    const login = new URL(handoff.headers.get('location') ?? '');
    expect(login.origin + login.pathname).toBe('https://tuturuuu.com/login');
    const verifier = new URL(login.searchParams.get('returnUrl') ?? '');
    expect(verifier.origin + verifier.pathname).toBe(
      APEX + BASE + '/verify-token'
    );
    expect(verifier.searchParams.get('nextUrl')).toBe(path);
    expect(handoff.headers.getSetCookie()).toEqual([]);

    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const completion = await proxy(mounted('/verify-token' + verifier.search));
    expect(completion.status).toBe(307);
    expect(completion.headers.get('location')).toBe(APEX + BASE + path);
    expect(completion.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    'https://tuturuuu.com/mail/personal',
    '//evil.example/personal',
    '/../mail/personal',
  ])('keeps a verifier return for %s inside the mount', async (next) => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const response = await proxy(
      mounted('/verify-token?' + new URLSearchParams({ nextUrl: next }))
    );
    expect(response.headers.get('location')).toBe(APEX + BASE);
  });

  it.each(['/personal', '/verify-token?nextUrl=%2Fpersonal'])(
    'requests MFA for %s',
    async (path) => {
      mocks.resolveMountedSession.mockResolvedValue({
        ok: false,
        error: 'MFA required',
      });
      const response = await proxy(mounted(path));
      const login = new URL(response.headers.get('location') ?? '');
      expect(login.searchParams.get('mfa')).toBe('required');
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  );

  it('returns the assurance service failure on a mounted page', async () => {
    mocks.resolveMountedSession.mockResolvedValue({
      ok: false,
      error: 'Account assurance unavailable',
    });
    const response = await proxy(mounted('/personal'));
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
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
