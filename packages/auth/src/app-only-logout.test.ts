import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  APP_LOGOUT_COOKIE_NAME,
  hasAppLogoutFence,
  hasSupportedSupabaseAuthCookie,
  setAppSessionCookie,
  verifyAppSessionRequest,
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppOnlyLogoutHandlers,
  createAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from './app-session';

const centralOrigin = 'https://tuturuuu.com';
const appOrigin = 'https://learn.tuturuuu.com';
const handlers = createAppOnlyLogoutHandlers({ centralOrigin });
const appCookieNames = [
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
];

afterEach(() => vi.unstubAllEnvs());

function request(
  origin: string | null,
  site: string | null = 'same-site',
  method = 'POST'
) {
  const headers = new Headers({
    accept: 'application/json',
    cookie: `${APP_SESSION_COOKIE_NAME}=app-fixture; sb-shared-auth-token=central-fixture`,
  });
  if (origin !== null) headers.set('origin', origin);
  if (site !== null) headers.set('sec-fetch-site', site);
  return new NextRequest(`${appOrigin}/api/auth/logout`, { method, headers });
}

describe('app-only logout boundary', () => {
  it('never changes cookies on GET or a permitted preflight', () => {
    const get = handlers.GET();
    expect(get.status).toBe(405);
    expect(get.headers.has('set-cookie')).toBe(false);
    const options = handlers.OPTIONS(
      request(centralOrigin, 'same-site', 'OPTIONS')
    );
    expect(options.status).toBe(204);
    expect(options.headers.has('set-cookie')).toBe(false);
  });

  it.each([
    [null, 'same-site'],
    ['null', 'cross-site'],
    ['https://attacker.example', 'cross-site'],
    ['https://tasks.tuturuuu.com', 'same-site'],
    ['https://tuturuuu.com.attacker.example', 'same-site'],
    [centralOrigin, 'cross-site'],
    [centralOrigin, 'none'],
  ])(
    'rejects an untrusted origin/site pair %s %s without clearing cookies',
    (origin, site) => {
      const response = handlers.POST(request(origin, site));
      expect(response.status).toBe(403);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
    }
  );

  it('ends only the selected app host session, preserving central and other app cookies', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://shared.supabase.co');
    const response = handlers.POST(request(centralOrigin));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(response.headers.get('access-control-allow-origin')).toBe(
      centralOrigin
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true'
    );
    expect(
      response.cookies
        .getAll()
        .map((cookie) => cookie.name)
        .sort()
    ).toEqual([...appCookieNames, APP_LOGOUT_COOKIE_NAME].sort());
    for (const cookie of response.cookies
      .getAll()
      .filter((cookie) => cookie.name !== APP_LOGOUT_COOKIE_NAME)) {
      expect(cookie.value).toBe('');
      expect(cookie.maxAge).toBe(0);
      expect(cookie.domain).toBeUndefined();
      expect(cookie.path).toBe('/');
    }
    expect(response.cookies.get('sb-shared-auth-token')).toBeUndefined();
    const fence = response.cookies.get(APP_LOGOUT_COOKIE_NAME);
    expect(fence).toMatchObject({
      value: '1',
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'lax',
    });
    expect(fence?.domain).toBeUndefined();
    const signedOut = new NextRequest(`${appOrigin}/personal`, {
      headers: {
        cookie: `${APP_LOGOUT_COOKIE_NAME}=1; sb-shared-auth-token=central-fixture`,
      },
    });
    expect(hasAppLogoutFence(signedOut)).toBe(true);
    expect(hasSupportedSupabaseAuthCookie(signedOut)).toBe(false);
    expect(verifyAppSessionRequest(signedOut)).toEqual({
      ok: false,
      error: 'App signed out',
    });
    const fixtureSecret = 'fixture-only-signing-secret';
    const { token } = createAppSessionToken(
      { userId: 'fixture-current', targetApp: 'tasks' },
      { secret: fixtureSecret }
    );
    const otherApp = new NextRequest('https://tasks.tuturuuu.com/personal', {
      headers: { cookie: `${APP_SESSION_COOKIE_NAME}=${token}` },
    });
    expect(
      verifyAppSessionRequest(otherApp, {
        targetApp: 'tasks',
        secret: fixtureSecret,
      }).ok
    ).toBe(true);
  });

  it('clears the host marker when an explicit sign-in sets a fresh session', () => {
    const response = new NextResponse();
    setAppSessionCookie(response, 'fixture-new-session');
    expect(response.cookies.get(APP_LOGOUT_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it('redirects legacy GET entries to confirmation without touching cookies', () => {
    const legacy = createAppOnlyLogoutHandlers({
      centralOrigin,
      confirmationOnGet: true,
    });
    const response = legacy.GET(request(null, null, 'GET'));
    expect(response.status).toBe(303);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(
      new URL(response.headers.get('location') ?? '').searchParams.get('appUrl')
    ).toBe(appOrigin);
  });

  it('retains same-origin POST compatibility', () => {
    expect(handlers.POST(request(appOrigin, 'same-origin')).status).toBe(200);
  });

  it.each(['http://learn.tuturuuu.com', 'https://tuturuuu.com'])(
    'rejects non-isolated or insecure app logout at %s without clearing sessions',
    (origin) => {
      const response = handlers.POST(
        new NextRequest(`${origin}/api/auth/logout`, {
          method: 'POST',
          headers: {
            origin,
            'sec-fetch-site': 'same-origin',
            accept: 'application/json',
          },
        })
      );
      expect(response.status).toBe(409);
      expect(response.headers.has('set-cookie')).toBe(false);
    }
  );
});
