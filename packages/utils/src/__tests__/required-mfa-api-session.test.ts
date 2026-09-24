// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { guardBrowserApiSession } from '../required-mfa-api-session';

const update = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: update }));
beforeEach(() => {
  update.mockReset();
});
it('checks refreshed cookies and propagates rotation on a policy rejection', async () => {
  const request = new NextRequest('https://example.com/api/v1/users/me', {
    headers: { cookie: 'sb-project-auth-token=old' },
  });
  update.mockImplementation(async (req: NextRequest) => {
    req.cookies.set('sb-project-auth-token', 'new');
    const res = NextResponse.next();
    res.cookies.set('sb-project-auth-token', 'new');
    return { res, claims: { sub: 'actor' } };
  });
  const response = await guardBrowserApiSession(request, async () => {
    expect(request.cookies.get('sb-project-auth-token')?.value).toBe('new');
    return NextResponse.json({ code: 'MFA_REQUIRED' }, { status: 403 });
  });
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toContain(
    'sb-project-auth-token=new'
  );
});
it.each([
  '/api/auth/refresh-app-session',
  '/api/v1/auth/cross-app-session/refresh',
])('does not recursively refresh the handoff handler %s', async (path) => {
  const request = new NextRequest(`https://example.com${path}`, {
    headers: { cookie: 'sb-project-auth-token=old' },
  });
  expect((await guardBrowserApiSession(request, async () => null)).status).toBe(
    200
  );
  expect(update).not.toHaveBeenCalled();
});
it('never replaces explicit bearer credentials with ambient browser cookies', async () => {
  const request = new NextRequest('https://example.com/api/v1/users/me', {
    headers: {
      authorization: 'Bearer explicit',
      cookie: 'sb-project-auth-token=old',
    },
  });
  await guardBrowserApiSession(request, async () => null);
  expect(update).not.toHaveBeenCalled();
});

it('removes superseded app credentials from the actual forwarded provider request', async () => {
  const request = new NextRequest('https://example.com/api/v1/users/me', {
    headers: {
      cookie:
        'sb-project-auth-token=provider; tuturuuu_app_session=stale-app; tuturuuu_web_app_session=other-user',
    },
  });
  update.mockResolvedValue({
    res: NextResponse.next(),
    claims: { sub: 'provider-user' },
  });
  const response = await guardBrowserApiSession(request, async () => {
    expect(request.cookies.has('tuturuuu_app_session')).toBe(false);
    expect(request.cookies.has('tuturuuu_web_app_session')).toBe(false);
    return null;
  });
  expect(response.headers.get('x-middleware-request-cookie')).toContain(
    'sb-project-auth-token=provider'
  );
  expect(response.headers.get('x-middleware-request-cookie')).not.toContain(
    'tuturuuu_'
  );
});
