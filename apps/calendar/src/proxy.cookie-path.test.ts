// @vitest-environment node
import {
  clearAppSessionCookie,
  setAppSessionCookie,
  setAppSessionRefreshCookie,
  setWebAppSessionCookie,
  setWebAppSessionRefreshCookie,
} from '@tuturuuu/auth/app-session';
import { propagateAuthCookies } from '@tuturuuu/auth/proxy';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `@supabase/ssr` 0.12.x writes each session cookie with
// `{ ...DEFAULT_COOKIE_OPTIONS (path '/'), ...cookieOptions, maxAge }`.
// The stub applies that merge without network so the real `updateSession`
// cookie wiring is exercised.
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookieOptions: Record<string, unknown> & { name?: string };
      cookies: {
        setAll: (
          cookies: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[]
        ) => void;
      };
    }
  ) => ({
    auth: {
      getClaims: async () => {
        const { name, ...cookieOptions } = options.cookieOptions;
        options.cookies.setAll([
          {
            name: `${name}`,
            value: 'base64-rotated-session',
            options: {
              path: '/',
              sameSite: 'lax',
              httpOnly: false,
              ...cookieOptions,
              maxAge: 400 * 24 * 60 * 60,
            },
          },
        ]);
        return { data: { claims: { sub: 'user-1' } }, error: null };
      },
    },
  }),
}));

const SUBDOMAIN_PAGE = 'https://calendar.tuturuuu.com/calendar/personal';
const PATH_ROOT = /;\s*path=\/(?:;|$)/iu;

function cookiesOf(response: NextResponse) {
  return response.headers.getSetCookie();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Calendar session cookies under the /calendar base path', () => {
  it('writes every app-session cookie at Path=/', () => {
    const response = NextResponse.next();
    setAppSessionCookie(response, 'app-token');
    setWebAppSessionCookie(response, 'web-token');
    setAppSessionRefreshCookie(response, 'app-refresh');
    setWebAppSessionRefreshCookie(response, 'web-refresh');
    const written = cookiesOf(response);
    expect(written.length).toBeGreaterThanOrEqual(4);
    for (const cookie of written) expect(cookie).toMatch(PATH_ROOT);

    const cleared = NextResponse.next();
    clearAppSessionCookie(cleared);
    expect(cookiesOf(cleared).length).toBeGreaterThan(0);
    for (const cookie of cookiesOf(cleared)) expect(cookie).toMatch(PATH_ROOT);
  });

  it('writes the refreshed Supabase session at Path=/ for a subdomain base-path request', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixtureref.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-key');
    const { updateSession } = await import('@tuturuuu/supabase/next/proxy');
    const request = new NextRequest(SUBDOMAIN_PAGE, {
      headers: { cookie: 'sb-fixtureref-auth-token=base64-previous' },
      nextConfig: { basePath: '/calendar' },
    });

    const { res } = await updateSession(request);
    const session = cookiesOf(res).filter((cookie) =>
      /^sb-[^=]+-auth-token=/u.test(cookie)
    );
    expect(session.length).toBeGreaterThan(0);
    for (const cookie of session) expect(cookie).toMatch(PATH_ROOT);
  });

  it('keeps Path=/ when the proxy copies auth cookies onto its final response', () => {
    const source = NextResponse.next();
    setAppSessionCookie(source, 'app-token');
    source.cookies.set('sb-fixtureref-auth-token', 'session', {
      path: '/',
      sameSite: 'lax',
    });
    const target = NextResponse.redirect(
      new URL('/calendar/personal', SUBDOMAIN_PAGE)
    );
    propagateAuthCookies(source, target);
    const copied = cookiesOf(target);
    expect(copied.length).toBeGreaterThanOrEqual(2);
    for (const cookie of copied) expect(cookie).toMatch(PATH_ROOT);
  });
});
