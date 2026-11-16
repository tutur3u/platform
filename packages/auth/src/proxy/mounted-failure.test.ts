import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  isExpiringSetCookie,
  mountedSessionFailureResponse,
  nonExpiringCookieCarrier,
  withoutExpiringCookies,
} from './mounted-failure';

const NOW = Date.parse('2026-11-17T00:00:00Z');
const PROVIDER = 'sb-nzamlzqfdwaaxdefwraj-auth-token';
const FRESH = `${PROVIDER}.0=fresh; Domain=.tuturuuu.com; Path=/; Max-Age=3600; Secure`;
const DELETED = `${PROVIDER}.1=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;
const EXPIRED = `${PROVIDER}.2=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
// A Web-owned provider cookie of another key that the refresh does not write.
const ASSURANCE_REFUSALS = new Set([
  'MFA required',
  'Account assurance unavailable',
]);
const UNRELATED =
  'sb-otherprojectref-auth-token=; Domain=.tuturuuu.com; Path=/; Max-Age=0';

function request(headers: Record<string, string> = {}, path = '/api/boards') {
  return new NextRequest(`https://tuturuuu.com/mind${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: { cookie: `${PROVIDER}.0=current`, ...headers },
  });
}

function refreshed() {
  const response = NextResponse.next();
  for (const cookie of [FRESH, DELETED, UNRELATED, EXPIRED])
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

  it('carries the cookie writes and the stale chunks of their keys', () => {
    expect(
      nonExpiringCookieCarrier(refreshed()).headers.getSetCookie()
    ).toEqual([FRESH, DELETED, EXPIRED]);
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
  ])('%s never expires a cookie it does not rewrite', async (error, status) => {
    const response = mountedSessionFailureResponse(
      request(),
      error,
      refreshed()
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // Only the assurance refusals carry the refresh's cookie writes.
    expect(response.headers.getSetCookie()).toEqual(
      ASSURANCE_REFUSALS.has(error) ? [FRESH, DELETED, EXPIRED] : []
    );
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
    expect(response.headers.getSetCookie()).toEqual([FRESH, DELETED, EXPIRED]);
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

describe('mounted refusals keep a rewritten session consistent', () => {
  const BARE = `${PROVIDER}=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;
  const CHUNK_0 = `${PROVIDER}.0=new-0; Domain=.tuturuuu.com; Path=/; Max-Age=3600; Secure`;
  const CHUNK_1 = `${PROVIDER}.1=new-1; Domain=.tuturuuu.com; Path=/; Max-Age=3600; Secure`;
  const WHOLE = `${PROVIDER}=whole; Domain=.tuturuuu.com; Path=/; Max-Age=3600; Secure`;
  const STALE_0 = `${PROVIDER}.0=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;
  const STALE_1 = `${PROVIDER}.1=; Domain=.tuturuuu.com; Path=/; Max-Age=0`;
  const STALE_2 = `${PROVIDER}.2=; Domain=.tuturuuu.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  const HOST_ONLY_BARE = `${PROVIDER}=; Path=/mind; Max-Age=0`;

  function refusal(...cookies: string[]) {
    const source = NextResponse.next();
    for (const cookie of cookies) source.headers.append('set-cookie', cookie);
    return mountedSessionFailureResponse(
      request(),
      'MFA required',
      source
    ).headers.getSetCookie();
  }

  it('expires the unchunked cookie when the rewrite chunks it', () => {
    expect(refusal(BARE, CHUNK_0, CHUNK_1, UNRELATED)).toEqual([
      BARE,
      CHUNK_0,
      CHUNK_1,
    ]);
  });

  it('expires every chunk when the rewrite is unchunked', () => {
    expect(refusal(STALE_0, STALE_1, UNRELATED, WHOLE)).toEqual([
      STALE_0,
      STALE_1,
      WHOLE,
    ]);
  });

  it('expires the chunks beyond a shorter rewrite', () => {
    expect(refusal(CHUNK_0, STALE_1, STALE_2)).toEqual([
      CHUNK_0,
      STALE_1,
      STALE_2,
    ]);
  });

  it('keeps the Domain and Path of a kept deletion', () => {
    expect(refusal(HOST_ONLY_BARE, CHUNK_0)).toEqual([HOST_ONLY_BARE, CHUNK_0]);
  });

  it('strips deletions for keys the response does not write', () => {
    expect(refusal(UNRELATED, STALE_1)).toEqual([]);
    const response = NextResponse.next();
    for (const cookie of [
      UNRELATED,
      CHUNK_0,
      `${PROVIDER}-code-verifier=; Path=/; Max-Age=0`,
    ])
      response.headers.append('set-cookie', cookie);
    expect(withoutExpiringCookies(response).headers.getSetCookie()).toEqual([
      CHUNK_0,
    ]);
  });
});
