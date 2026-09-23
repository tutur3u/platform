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
