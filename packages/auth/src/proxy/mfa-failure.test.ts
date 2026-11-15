import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  appSessionFailureResponse,
  preserveMfaRecoveryCookies,
} from './mfa-failure';

const clear = vi.hoisted(() =>
  vi.fn((_request: NextRequest, response: NextResponse) => response)
);
vi.mock('../app-session', () => ({ clearSupabaseAuthCookies: clear }));
beforeEach(() => clear.mockClear());
const req = new NextRequest(
  'https://mail.tuturuuu.com/api/v1/users/me/profile'
);
it('retains the rotated provider cookie and returns actionable MFA status', async () => {
  const refreshed = NextResponse.next();
  refreshed.cookies.set('sb-project-auth-token', 'rotated');
  const response = appSessionFailureResponse(req, 'MFA required', refreshed);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  expect(response.headers.get('set-cookie')).toContain(
    'sb-project-auth-token=rotated'
  );
  expect(clear).not.toHaveBeenCalled();
  expect(preserveMfaRecoveryCookies(req, response)).toBe(response);
  expect(clear).not.toHaveBeenCalled();
});
it('keeps existing cleanup for invalid or expired sessions', () => {
  expect(appSessionFailureResponse(req, 'Invalid app session').status).toBe(
    401
  );
  expect(clear).toHaveBeenCalledOnce();
});
it('does not treat an unrelated forbidden response as MFA recovery', () => {
  const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  preserveMfaRecoveryCookies(req, response);
  expect(clear).toHaveBeenCalledOnce();
});
it('fails closed without destroying the session when assurance lookup is unavailable', async () => {
  const response = appSessionFailureResponse(
    req,
    'Account assurance unavailable'
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'AUTH_UNAVAILABLE' });
  expect(clear).not.toHaveBeenCalled();
});

it.each([
  ['MFA required', 403, 'auth-assurance-required'],
  ['Account assurance unavailable', 503, 'auth-assurance-unavailable'],
  ['App session refresh unavailable', 503, 'app-session-refresh-unavailable'],
  ['Invalid app session', 401, 'app-session-unauthenticated'],
] as const)(
  'labels %s without changing its status',
  (error, status, reason) => {
    const response = appSessionFailureResponse(req, error);
    expect(response.status).toBe(status);
    expect(response.headers.get('X-Tuturuuu-Guard-Reason')).toBe(reason);
  }
);

const UNAVAILABLE = [
  ['App session refresh unavailable', 'APP_SESSION_REFRESH_UNAVAILABLE'],
  ['Account assurance unavailable', 'AUTH_UNAVAILABLE'],
] as const;
const page = (headers: Record<string, string>, method = 'GET', path = '/') =>
  new NextRequest(`https://tasks.tuturuuu.com${path}?next=%3Cscript%3E`, {
    headers,
    method,
  });

it.each(UNAVAILABLE)(
  '%s renders a static HTML 503 for a document navigation',
  async (error) => {
    for (const request of [
      page({ 'sec-fetch-mode': 'navigate', accept: 'text/html' }),
      page({ 'sec-fetch-mode': 'navigate' }, 'HEAD'),
      // Clients without Fetch Metadata: an HTML GET is a page load.
      page({ accept: 'text/html,application/xhtml+xml' }),
    ]) {
      const response = appSessionFailureResponse(request, error);
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('retry-after')).toBe('30');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('location')).toBeNull();
      const body = await response.text();
      expect(body).toContain('Sign-in is temporarily unavailable');
      // Nothing from the request is reflected, and the only link reloads
      // the current URL.
      expect(body).not.toMatch(/script|tasks\.tuturuuu|next=|\/api/i);
      expect([...body.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([
        '',
      ]);
      expect(clear).not.toHaveBeenCalled();
    }
  }
);

it.each(UNAVAILABLE)(
  '%s keeps the JSON 503 for API, fetch and form callers',
  async (error, code) => {
    for (const request of [
      page({ 'sec-fetch-mode': 'cors', accept: 'text/html' }),
      page({ 'sec-fetch-mode': 'same-origin' }),
      page({ 'sec-fetch-mode': 'navigate' }, 'POST'),
      page({ 'sec-fetch-mode': 'navigate' }, 'GET', '/api/v1/tasks'),
      page({ accept: 'application/json' }),
      page({}),
    ]) {
      const response = appSessionFailureResponse(request, error);
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain(
        'application/json'
      );
      expect(await response.json()).toMatchObject({ code });
    }
  }
);

it('keeps MFA and unauthenticated outcomes unchanged for navigations', async () => {
  const navigate = page({ 'sec-fetch-mode': 'navigate', accept: 'text/html' });
  const required = appSessionFailureResponse(navigate, 'MFA required');
  expect(required.status).toBe(403);
  expect(await required.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  expect(
    appSessionFailureResponse(navigate, 'Invalid app session').status
  ).toBe(401);
  expect(clear).toHaveBeenCalledOnce();
});

it('keeps rotated cookies and the assurance marker on the assurance page', () => {
  const refreshed = NextResponse.next();
  refreshed.cookies.set('sb-project-auth-token', 'rotated');
  const response = appSessionFailureResponse(
    page({ 'sec-fetch-mode': 'navigate' }),
    'Account assurance unavailable',
    refreshed
  );
  expect(response.headers.get('set-cookie')).toContain(
    'sb-project-auth-token=rotated'
  );
  expect(response.headers.get('X-Tuturuuu-Guard-Reason')).toBe(
    'auth-assurance-unavailable'
  );
  expect(preserveMfaRecoveryCookies(req, response)).toBe(response);
  expect(clear).not.toHaveBeenCalled();
});
