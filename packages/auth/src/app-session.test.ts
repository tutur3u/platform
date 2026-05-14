import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  clearAppSessionCookie,
  createAppSessionToken,
  getAppSessionClaimsFromRequest,
  getAppSessionTokenFromRequest,
  getAppSessionUserFromRequest,
  setAppSessionCookie,
  verifyAppSessionToken,
} from './app-session';

describe('app-session JWTs', () => {
  beforeEach(() => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
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

  it('always includes the app-session scope when custom scopes are added', () => {
    const { claims } = createAppSessionToken({
      scopes: ['custom:scope'],
      targetApp: 'learn',
      userId: 'user-1',
    });

    expect(claims.scopes).toEqual(['internal-app:session', 'custom:scope']);
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

  it('sets and clears the host-only app-session cookie', () => {
    const { token } = createAppSessionToken({
      targetApp: 'learn',
      userId: 'user-1',
    });
    const response = NextResponse.json({ ok: true });

    setAppSessionCookie(response, token, {
      expires: new Date('2026-01-01T08:00:00.000Z'),
    });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${APP_SESSION_COOKIE_NAME}=ttr_app_`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');

    const clearResponse = NextResponse.json({ ok: true });
    clearAppSessionCookie(clearResponse);

    const clearCookie = clearResponse.headers.get('set-cookie') ?? '';
    expect(clearCookie).toContain(`${APP_SESSION_COOKIE_NAME}=`);
    expect(clearCookie).toContain('Max-Age=0');
  });
});
