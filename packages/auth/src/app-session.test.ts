import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  APP_SESSION_REFRESH_SCOPE,
  attachSupabaseAuthUser,
  clearAppSessionCookie,
  clearSupabaseAuthCookies,
  createAppSessionLogoutResponse,
  createAppSessionToken,
  createAppSessionTokenPair,
  getAppSessionClaimsFromRequest,
  getAppSessionRefreshEarlySeconds,
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getAppSessionUserFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  hasWebAppSessionTokenFromRequest,
  setAppSessionCookie,
  setAppSessionRefreshCookie,
  setWebAppSessionCookie,
  setWebAppSessionRefreshCookie,
  verifyAppSessionRefreshToken,
  verifyAppSessionRequest,
  verifyAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
  WEB_APP_SESSION_REFRESH_COOKIE_NAME,
} from './app-session';
import {
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
  resolveInternalAppSessionPolicy,
} from './app-session-policy';

describe('app-session JWTs', () => {
  beforeEach(() => {
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVER_URL;
    delete process.env.SUPABASE_URL;
  });

  it('creates and verifies an app-session token for the target app', () => {
    const { token } = createAppSessionToken(
      {
        email: 'agent@example.com',
        scopes: ['internal-app:session'],
        targetApp: 'learn',
        userId: 'user-1',
      },
      { now: new Date('2026-01-01T00:00:00.000Z') }
    );

    const verification = verifyAppSessionToken(token, {
      now: new Date('2026-01-01T00:00:01.000Z'),
      targetApp: 'learn',
    });

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.sub).toBe('user-1');
      expect(verification.claims.email).toBe('agent@example.com');
      expect(verification.claims.target_app).toBe('learn');
    }
  });

  it('uses a development-only secret when satellite apps have no explicit local signing secret', () => {
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');

    const { token } = createAppSessionToken({
      email: 'agent@example.com',
      targetApp: 'chat',
      userId: 'user-1',
    });

    const verification = verifyAppSessionToken(token, {
      targetApp: 'chat',
    });

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.sub).toBe('user-1');
    }
  });

  it('always includes the app-session scope when custom scopes are added', () => {
    const { claims } = createAppSessionToken({
      scopes: ['custom:scope'],
      targetApp: 'learn',
      userId: 'user-1',
    });

    expect(claims.scopes).toEqual(['internal-app:session', 'custom:scope']);
  });

  it('creates policy-based access and refresh token pairs with separate scopes', () => {
    const pair = createAppSessionTokenPair(
      {
        email: 'agent@example.com',
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
        policy: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
      }
    );

    expect(pair.access.claims.exp - pair.access.claims.iat).toBe(600);
    expect(pair.refresh.claims.exp - pair.refresh.claims.iat).toBe(86_400);
    expect(pair.access.claims.scopes).toContain('internal-app:session');
    expect(pair.access.claims.scopes).toContain(
      'internal-app:refresh-early:120'
    );
    expect(pair.refresh.claims.scopes).toEqual([APP_SESSION_REFRESH_SCOPE]);
    expect(getAppSessionRefreshEarlySeconds(pair.access.claims)).toBe(120);
  });

  it('rejects refresh tokens as access tokens and access tokens as refresh tokens', () => {
    const pair = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });

    expect(
      verifyAppSessionToken(pair.refresh.token, { targetApp: 'learn' })
    ).toEqual({
      error: 'App session missing required scope',
      ok: false,
    });
    expect(
      verifyAppSessionRefreshToken(pair.access.token, { targetApp: 'learn' })
    ).toEqual({
      error: 'App session refresh token missing required scope',
      ok: false,
    });
    expect(
      verifyAppSessionRefreshToken(pair.refresh.token, { targetApp: 'learn' })
        .ok
    ).toBe(true);
  });

  it('resolves per-app overrides for token pair policy', () => {
    const policy = {
      ...DEFAULT_APP_COORDINATION_SESSION_POLICY,
      internalAppOverrides: {
        learn: {
          internalAppAccessTtlSeconds: 900,
          internalAppRefreshEarlySeconds: 180,
          internalAppRefreshTtlSeconds: 172_800,
        },
      },
    };

    const resolved = resolveInternalAppSessionPolicy(policy, 'learn');
    const pair = createAppSessionTokenPair(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      {
        now: new Date('2026-01-01T00:00:00.000Z'),
        policy: resolved,
      }
    );

    expect(pair.access.claims.exp - pair.access.claims.iat).toBe(900);
    expect(pair.refresh.claims.exp - pair.refresh.claims.iat).toBe(172_800);
    expect(pair.refreshEarlySeconds).toBe(180);
  });

  it('falls back to the server-side Supabase secret for deployed satellite apps', () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'supabase-server-secret');

    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });

    const verification = verifyAppSessionToken(token, {
      targetApp: 'learn',
    });

    expect(verification.ok).toBe(true);
  });

  it('verifies Supabase-secret signed app-session tokens when web also has an explicit coordination secret', () => {
    const { token } = createAppSessionToken(
      {
        targetApp: 'learn',
        userId: 'user-1',
      },
      { secret: 'supabase-server-secret' }
    );

    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'web-coordination-secret');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'supabase-server-secret');

    const verification = verifyAppSessionToken(token, {
      targetApp: 'learn',
    });

    expect(verification.ok).toBe(true);
  });

  it('rejects target-app mismatches', () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });

    expect(verifyAppSessionToken(token, { targetApp: 'teach' })).toEqual({
      error: 'App session target mismatch',
      ok: false,
    });
  });

  it('accepts target-app allow lists and rejects tokens outside the list', () => {
    const { token } = createAppSessionToken({
      targetApp: 'calendar',
      userId: 'user-1',
    });

    expect(
      verifyAppSessionToken(token, {
        targetApp: ['calendar', 'track'],
      }).ok
    ).toBe(true);

    expect(
      verifyAppSessionToken(token, {
        targetApp: ['learn', 'teach'],
      })
    ).toEqual({
      error: 'App session target mismatch',
      ok: false,
    });
  });

  it('rejects expired and tampered app-session tokens', () => {
    const { token } = createAppSessionToken(
      {
        expiresInSeconds: 1,
        targetApp: 'learn',
        userId: 'user-1',
      },
      { now: new Date('2026-01-01T00:00:00.000Z') }
    );

    expect(
      verifyAppSessionToken(token, {
        now: new Date('2026-01-01T00:00:02.000Z'),
        targetApp: 'learn',
      })
    ).toEqual({
      error: 'Token expired',
      ok: false,
    });

    const tamperedToken = `${token.slice(0, -1)}x`;
    expect(
      verifyAppSessionToken(tamperedToken, { targetApp: 'learn' })
    ).toEqual({
      error: 'Invalid token signature',
      ok: false,
    });
  });

  it('reads app-session tokens from HttpOnly cookies and Bearer headers', () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const cookieRequest = new NextRequest('https://learn.tuturuuu.com/', {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
    });
    const bearerRequest = new NextRequest('https://learn.tuturuuu.com/', {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(getAppSessionTokenFromRequest(cookieRequest)).toBe(token);
    expect(getAppSessionTokenFromRequest(bearerRequest)).toBe(token);
    expect(
      getAppSessionClaimsFromRequest(cookieRequest, { targetApp: 'learn' })?.sub
    ).toBe('user-1');
    expect(
      getAppSessionUserFromRequest(cookieRequest, { targetApp: 'learn' })?.id
    ).toBe('user-1');
  });

  it('attaches app-session users to admin Supabase auth helpers', async () => {
    const supabase = { auth: { signOut: vi.fn() }, from: vi.fn() };
    const user = {
      aud: 'authenticated',
      email: 'agent@example.com',
      id: 'user-1',
      role: 'authenticated',
    };

    const authSupabase = attachSupabaseAuthUser(
      supabase as unknown as TypedSupabaseClient,
      user as SupabaseUser
    );

    await expect(authSupabase.auth.getUser()).resolves.toEqual({
      data: { user },
      error: null,
    });
    await expect(authSupabase.auth.getClaims()).resolves.toEqual({
      data: {
        claims: expect.objectContaining({
          email: 'agent@example.com',
          sub: 'user-1',
        }),
      },
      error: null,
    });
    await expect(authSupabase.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
    expect(authSupabase.auth.signOut).toBe(supabase.auth.signOut);
  });

  it('detects the Web-issued app-session cookie separately from the local app-session cookie', () => {
    const { token: localToken } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'local-user',
    });
    const { token: webToken } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'web-user',
    });
    const request = new NextRequest('https://learn.tuturuuu.localhost/', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${localToken}`,
          `${WEB_APP_SESSION_COOKIE_NAME}=${webToken}`,
        ].join('; '),
      },
    });

    expect(getAppSessionTokenFromRequest(request)).toBe(webToken);
    expect(getWebAppSessionTokenFromRequest(request)).toBe(webToken);
    expect(hasWebAppSessionTokenFromRequest(request)).toBe(true);
  });

  it('prefers the Web-issued app cookie when both app-session cookies are valid', () => {
    const { token: localToken } = createAppSessionToken({
      email: 'local@example.com',
      targetApp: 'learn',
      userId: 'local-user',
    });
    const { token: webToken } = createAppSessionToken({
      email: 'web@example.com',
      targetApp: 'learn',
      userId: 'web-user',
    });
    const request = new NextRequest('https://learn.tuturuuu.localhost/api', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${localToken}`,
          `${WEB_APP_SESSION_COOKIE_NAME}=${webToken}`,
        ].join('; '),
      },
    });

    const verification = verifyAppSessionRequest(request, {
      targetApp: 'learn',
    });

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.claims.email).toBe('web@example.com');
      expect(verification.claims.sub).toBe('web-user');
    }
  });

  it('falls back to the local app cookie when the Web-issued app cookie is not verifiable', () => {
    const { token: localToken } = createAppSessionToken(
      {
        targetApp: 'learn',
        userId: 'local-user',
      },
      { secret: 'learn-local-secret' }
    );
    const { token: webToken } = createAppSessionToken(
      {
        targetApp: 'learn',
        userId: 'web-user',
      },
      { secret: 'web-central-secret' }
    );
    const request = new NextRequest('https://learn.tuturuuu.localhost/api', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${localToken}`,
          `${WEB_APP_SESSION_COOKIE_NAME}=${webToken}`,
        ].join('; '),
      },
    });

    const localVerification = verifyAppSessionRequest(request, {
      secret: 'learn-local-secret',
      targetApp: 'learn',
    });
    const webVerification = verifyAppSessionRequest(request, {
      secret: 'web-central-secret',
      targetApp: 'learn',
    });

    expect(localVerification.ok).toBe(true);
    if (localVerification.ok) {
      expect(localVerification.claims.sub).toBe('local-user');
    }

    expect(webVerification.ok).toBe(true);
    if (webVerification.ok) {
      expect(webVerification.claims.sub).toBe('web-user');
    }
  });

  it('sets and clears the host-only app-session cookie pair', () => {
    const { access, refresh } = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const response = NextResponse.json({ ok: true });

    setAppSessionCookie(response, access.token, {
      expires: new Date('2026-01-01T08:00:00.000Z'),
    });
    setWebAppSessionCookie(response, access.token, {
      expires: new Date('2026-01-01T08:00:00.000Z'),
    });
    setAppSessionRefreshCookie(response, refresh.token, {
      expires: new Date('2026-01-31T00:00:00.000Z'),
    });
    setWebAppSessionRefreshCookie(response, refresh.token, {
      expires: new Date('2026-01-01T08:00:00.000Z'),
    });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${APP_SESSION_COOKIE_NAME}=ttr_app_`);
    expect(setCookie).toContain(`${WEB_APP_SESSION_COOKIE_NAME}=ttr_app_`);
    expect(setCookie).toContain(`${APP_SESSION_REFRESH_COOKIE_NAME}=ttr_app_`);
    expect(setCookie).toContain(
      `${WEB_APP_SESSION_REFRESH_COOKIE_NAME}=ttr_app_`
    );
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');

    const clearResponse = NextResponse.json({ ok: true });
    clearAppSessionCookie(clearResponse);

    const clearCookie = clearResponse.headers.get('set-cookie') ?? '';
    expect(clearCookie).toContain(`${APP_SESSION_COOKIE_NAME}=`);
    expect(clearCookie).toContain(`${WEB_APP_SESSION_COOKIE_NAME}=`);
    expect(clearCookie).toContain(`${APP_SESSION_REFRESH_COOKIE_NAME}=`);
    expect(clearCookie).toContain(`${WEB_APP_SESSION_REFRESH_COOKIE_NAME}=`);
    expect(clearCookie).toContain('Max-Age=0');
  });

  it('reads refresh tokens from local and Web-issued HttpOnly cookies', () => {
    const { refresh } = createAppSessionTokenPair({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const request = new NextRequest('https://learn.tuturuuu.localhost/', {
      headers: {
        cookie: [
          `${APP_SESSION_REFRESH_COOKIE_NAME}=${refresh.token}`,
          `${WEB_APP_SESSION_REFRESH_COOKIE_NAME}=${refresh.token}`,
        ].join('; '),
      },
    });

    expect(getAppSessionRefreshTokenFromRequest(request)).toBe(refresh.token);
    expect(getWebAppSessionRefreshTokenFromRequest(request)).toBe(
      refresh.token
    );
  });

  it('clears stale Supabase auth cookies without touching app-session cookies', () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const request = new NextRequest('https://learn.tuturuuu.com/', {
      headers: {
        cookie: [
          `${APP_SESSION_COOKIE_NAME}=${token}`,
          'sb-test-auth-token=stale',
          'sb-test-auth-token.0=stale-chunk',
          'regular_cookie=value',
        ].join('; '),
      },
    });
    const response = clearSupabaseAuthCookies(
      request,
      NextResponse.json({ ok: true })
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('sb-test-auth-token=;');
    expect(setCookie).toContain('sb-test-auth-token.0=;');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).not.toContain(`${APP_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).not.toContain('regular_cookie=;');
  });

  it('preserves the canonical shared Supabase cookie on production Tuturuuu subdomains', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://nzamlzqfdwaaxdefwraj.supabase.co';
    const request = new NextRequest('https://tasks.tuturuuu.com/personal', {
      headers: {
        cookie: [
          'sb-nzamlzqfdwaaxdefwraj-auth-token=shared-session',
          'sb-nzamlzqfdwaaxdefwraj-auth-token.0=shared-session-chunk',
          'sb-stale-auth-token=stale',
        ].join('; '),
      },
    });
    const response = clearSupabaseAuthCookies(
      request,
      NextResponse.json({ ok: true })
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).not.toContain('sb-nzamlzqfdwaaxdefwraj-auth-token=;');
    expect(setCookie).not.toContain('sb-nzamlzqfdwaaxdefwraj-auth-token.0=;');
    expect(setCookie).toContain('sb-stale-auth-token=;');
  });

  it('preserves the canonical shared Supabase cookie on local Tuturuuu subdomains', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8001';
    const request = new NextRequest(
      'https://tasks.tuturuuu.localhost/personal',
      {
        headers: {
          cookie: [
            'sb-127-auth-token=shared-local-session',
            'sb-stale-auth-token=stale',
          ].join('; '),
        },
      }
    );
    const response = clearSupabaseAuthCookies(
      request,
      NextResponse.json({ ok: true })
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).not.toContain('sb-127-auth-token=;');
    expect(setCookie).toContain('sb-stale-auth-token=;');
  });

  it('does not preserve canonical Supabase cookies on unrelated hosts', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://nzamlzqfdwaaxdefwraj.supabase.co';
    const request = new NextRequest('https://preview.vercel.app/personal', {
      headers: {
        cookie: 'sb-nzamlzqfdwaaxdefwraj-auth-token=preview-session',
      },
    });
    const response = clearSupabaseAuthCookies(
      request,
      NextResponse.json({ ok: true })
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('sb-nzamlzqfdwaaxdefwraj-auth-token=;');
  });

  it('redirects browser logout requests after clearing local app cookies', () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const request = new NextRequest(
      'https://learn.tuturuuu.com/api/auth/logout',
      {
        headers: {
          accept: 'text/html',
          cookie: [
            `${APP_SESSION_COOKIE_NAME}=${token}`,
            `${WEB_APP_SESSION_COOKIE_NAME}=${token}`,
            'sb-test-auth-token=stale',
          ].join('; '),
        },
        method: 'POST',
      }
    );
    const response = createAppSessionLogoutResponse(request, {
      redirectUrl: 'https://tuturuuu.com/logout?from=Learn',
    });
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/logout?from=Learn'
    );
    expect(setCookie).toContain(`${APP_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain(`${WEB_APP_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain('sb-test-auth-token=;');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('keeps JSON compatibility for programmatic logout requests', async () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const request = new NextRequest(
      'https://learn.tuturuuu.com/api/auth/logout',
      {
        headers: {
          accept: 'application/json',
          cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
        },
      }
    );
    const response = createAppSessionLogoutResponse(request, {
      redirectUrl: 'https://tuturuuu.com/logout?from=Learn',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
