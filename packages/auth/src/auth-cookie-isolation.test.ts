import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', '');
  vi.stubEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'https://fxefojytwimjiqxseqag.supabase.co'
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('auth cookie serialization isolation', () => {
  it('preserves the exact production Set-Cookie wire bytes with no configuration', async () => {
    const auth = await import('./app-session.js');
    const response = new NextResponse(null);
    auth.setAppSessionCookie(response, 'sentinel');
    expect(response.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=sentinel; Path=/; Secure; HttpOnly; SameSite=lax',
    ]);
    expect(auth.APP_SESSION_COOKIE_NAME).toBe('tuturuuu_app_session');
    expect(auth.WEB_APP_SESSION_COOKIE_NAME).toBe('tuturuuu_web_app_session');
    expect(auth.APP_SESSION_REFRESH_COOKIE_NAME).toBe(
      'tuturuuu_app_session_refresh'
    );
    expect(auth.WEB_APP_SESSION_REFRESH_COOKIE_NAME).toBe(
      'tuturuuu_web_app_session_refresh'
    );
  });

  it('writes and clears only prefixed host-only app cookies with staging configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    const auth = await import('./app-session.js');
    const response = new NextResponse(null);
    auth.setAppSessionCookie(response, 'stage');
    auth.setWebAppSessionCookie(response, 'stage');
    auth.setAppSessionRefreshCookie(response, 'stage');
    auth.setWebAppSessionRefreshCookie(response, 'stage');
    const names = [
      auth.APP_SESSION_COOKIE_NAME,
      auth.WEB_APP_SESSION_COOKIE_NAME,
      auth.APP_SESSION_REFRESH_COOKIE_NAME,
      auth.WEB_APP_SESSION_REFRESH_COOKIE_NAME,
    ];
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual(names);
    expect(names.every((name) => name.startsWith('__Host-staging-'))).toBe(
      true
    );
    auth.clearAppSessionCookie(response);
    for (const cookie of response.cookies.getAll()) {
      expect(cookie.domain).toBeUndefined();
      expect(cookie.secure).toBe(true);
      expect(cookie.name.startsWith('__Host-staging-')).toBe(true);
      expect(cookie.maxAge).toBe(0);
    }
    expect(response.headers.getSetCookie().join('\n')).not.toContain(
      'Domain=.tuturuuu.com'
    );
  });

  it('does not clear or accept production cookie names in a staging namespace', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    const auth = await import('./app-session.js');
    const production = 'sb-production-auth-token';
    const stage = '__Host-staging-sb-other-auth-token';
    const request = new NextRequest('https://staging.tuturuuu.com/', {
      headers: {
        cookie: `${production}=prod-sentinel; ${stage}=stage-sentinel; tuturuuu_app_session=prod-app-sentinel`,
      },
    });
    const response = auth.clearSupabaseAuthCookies(
      request,
      new NextResponse(null)
    );
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual([stage]);
    expect(response.cookies.get(production)).toBeUndefined();
    expect(response.cookies.get('tuturuuu_app_session')).toBeUndefined();
    expect(auth.isSupabaseAuthCookieName(production)).toBe(false);
    expect(auth.isSupabaseAuthCookieName(`${stage}.0`)).toBe(true);
    expect(auth.getAppSessionTokenFromRequest(request)).toBeNull();
  });

  it('still applies CSRF protection to prefixed app and Supabase session cookies', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    const { isDefaultSessionCookieName } = await import('./csrf.js');
    expect(
      isDefaultSessionCookieName('__Host-staging-tuturuuu_app_session')
    ).toBe(true);
    expect(
      isDefaultSessionCookieName('__Host-staging-sb-test-auth-token.0')
    ).toBe(true);
    expect(
      isDefaultSessionCookieName(
        '__Host-staging-sb-test-auth-token-code-verifier'
      )
    ).toBe(false);
  });
});

it.each(['', 'staging-'])(
  'keeps every audience-bound app cookie host-only even with parent scope (%s)',
  async (prefix) => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'parent-domain');
    vi.stubEnv('WEB_APP_URL', 'https://calendar.tuturuuu.com');
    const auth = await import('./app-session.js');
    const response = new NextResponse(null);
    auth.setAppSessionCookie(response, 'access');
    auth.setWebAppSessionCookie(response, 'access');
    auth.setAppSessionRefreshCookie(response, 'refresh');
    auth.setWebAppSessionRefreshCookie(response, 'refresh');
    expect(response.cookies.getAll()).toHaveLength(4);
    for (const cookie of response.cookies.getAll()) {
      expect(cookie.domain).toBeUndefined();
      expect(cookie.secure).toBe(true);
    }
  }
);
it('requires secure host-only app cookies on non-local HTTP staging origins', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', 'staging-');
  vi.stubEnv('WEB_APP_URL', 'http://tuturuuu-staging.com');
  const auth = await import('./app-session.js');
  expect(auth.getAppSessionCookieOptions()).toMatchObject({ secure: true });
});

it.each(['', 'parent-domain', 'host-only'])(
  'requires a trusted hostname in cookie mode %s',
  async (scope) => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', scope);
    const auth = await import('./app-session.js');
    const name = 'sb-fxefojytwimjiqxseqag-auth-token';
    const untrusted = new NextRequest('https://untrusted.example/', {
      headers: { cookie: `${name}=fixture` },
    });
    expect(auth.hasSupportedSupabaseAuthCookie(untrusted)).toBe(false);
    const response = auth.clearSupabaseAuthCookies(
      untrusted,
      new NextResponse(null)
    );
    expect(response.cookies.get(name)?.maxAge).toBe(0);
    const trusted = new NextRequest('https://calendar.tuturuuu.com/', {
      headers: { cookie: `${name}=fixture` },
    });
    expect(auth.hasSupportedSupabaseAuthCookie(trusted)).toBe(true);
    expect(
      auth
        .clearSupabaseAuthCookies(trusted, new NextResponse(null))
        .cookies.get(name)
    ).toBeUndefined();
  }
);
it('keeps the loopback HTTP E2E exception limited to loopback requests', async () => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
  vi.stubEnv('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', '1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
  const auth = await import('./app-session.js');
  const headers = { cookie: 'sb-127-auth-token=fixture' };
  expect(
    auth.hasSupportedSupabaseAuthCookie(
      new NextRequest('http://localhost:7803/', { headers })
    )
  ).toBe(true);
  expect(
    auth.hasSupportedSupabaseAuthCookie(
      new NextRequest('https://untrusted.example/', { headers })
    )
  ).toBe(false);
});
