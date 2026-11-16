import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  isExpiringSetCookie,
  mountedSessionFailureResponse,
  nonExpiringCookieCarrier,
} from './mounted-failure';

const NOW = Date.parse('2026-11-17T00:00:00Z');
const PROVIDER = 'sb-nzamlzqfdwaaxdefwraj-auth-token';
const FRESH = `${PROVIDER}.0=fresh; Domain=.tuturuuu.com; Path=/; Max-Age=3600; Secure`;
const DELETED = `${PROVIDER}.1=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;
const EXPIRED = `${PROVIDER}.2=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

/** True when any Set-Cookie on `response` deletes or expires a cookie. */
function expiresAnyCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .some((cookie) => isExpiringSetCookie(cookie));
}

function request(headers: Record<string, string> = {}, path = '/api/boards') {
  return new NextRequest(`https://tuturuuu.com/mind${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: { cookie: `${PROVIDER}.0=current`, ...headers },
  });
}

function refreshed() {
  const response = NextResponse.next();
  for (const cookie of [FRESH, DELETED, EXPIRED])
    response.headers.append('set-cookie', cookie);
  return response;
}

describe('expiring Set-Cookie detection', () => {
  it.each([
    [DELETED, true],
    [EXPIRED, true],
    [`${PROVIDER}=x; Max-Age=-1`, true],
    [`${PROVIDER}=x; max-age=`, true],
    [`${PROVIDER}=x; Expires=not-a-date`, true],
    [FRESH, false],
    [`${PROVIDER}=x; Expires=Fri, 01 Jan 2027 00:00:00 GMT`, false],
    [`${PROVIDER}=x; Path=/; HttpOnly`, false],
  ])('%s → %s', (cookie, expected) => {
    expect(isExpiringSetCookie(cookie, NOW)).toBe(expected);
  });

  it('carries only cookie writes', () => {
    expect(
      nonExpiringCookieCarrier(refreshed()).headers.getSetCookie()
    ).toEqual([FRESH]);
    expect(nonExpiringCookieCarrier(undefined).headers.getSetCookie()).toEqual(
      []
    );
  });
});

describe('mounted session refusals keep Web-owned cookies', () => {
  it.each([
    ['Shared session unavailable', 401],
    ['App signed out', 401],
    ['Unauthorized', 401],
    ['MFA required', 403],
    ['Account assurance unavailable', 503],
    ['App session refresh unavailable', 503],
  ])('%s never clears or expires a cookie', async (error, status) => {
    const response = mountedSessionFailureResponse(
      request(),
      error,
      refreshed()
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(expiresAnyCookie(response)).toBe(false);
    expect(
      response.headers.getSetCookie().every((cookie) => cookie === FRESH)
    ).toBe(true);
  });

  it('keeps an assurance refusal on its document page without expiring cookies', async () => {
    const response = mountedSessionFailureResponse(
      request({ 'sec-fetch-mode': 'navigate' }, '/boards'),
      'Account assurance unavailable',
      refreshed()
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([FRESH]);
  });

  it('answers an unauthenticated mount request without any Set-Cookie', async () => {
    const response = mountedSessionFailureResponse(
      request(),
      'Shared session unavailable'
    );
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
