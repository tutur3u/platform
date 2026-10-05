import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  web: vi.fn(),
  supabase: vi.fn(),
  propagate: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  hasWebAppSessionTokenFromRequest: mocks.web,
  hasSupportedSupabaseAuthCookie: mocks.supabase,
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual('../../../packages/auth/src/proxy/redirect-path')),
  refreshAppSessionForRequest: mocks.refresh,
  propagateAuthCookies: mocks.propagate,
}));
vi.mock('./constants/common', () => ({
  BASE_URL: 'https://lettin.synthetic.test',
  WEB_APP_URL: 'https://web.synthetic.test',
}));

import { getLoginRedirect } from './login-redirect';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ ok: false, error: 'Missing app session' });
  mocks.web.mockReturnValue(false);
  mocks.supabase.mockReturnValue(false);
});

it('returns an HTTP 307 to central login with a sanitized return URL', async () => {
  const response = await getLoginRedirect(
    new NextRequest('https://lettin.synthetic.test/login?next=/workspace/wiki')
  );
  expect(response.status).toBe(307);
  expect(await response.text()).toBe('');
  const location = new URL(response.headers.get('location')!);
  expect(location.origin).toBe('https://web.synthetic.test');
  expect(location.pathname).toBe('/login');
  const returnUrl = new URL(location.searchParams.get('returnUrl')!);
  expect(returnUrl.origin).toBe('https://lettin.synthetic.test');
  expect(returnUrl.pathname).toBe('/verify-token');
  expect(returnUrl.searchParams.get('nextUrl')).toBe('/workspace/wiki');
});

it.each(['web', 'supabase'] as const)(
  'waits for verified %s identity and keeps HTTP redirect semantics',
  async (marker) => {
    let finish!: (value: unknown) => void;
    mocks.refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    mocks[marker].mockReturnValue(true);
    const cookieResponse = NextResponse.next();
    const requestHeaders = new Headers({ 'x-synthetic': 'verified' });
    let settled = false;
    const pending = getLoginRedirect(
      new NextRequest(
        'https://lettin.synthetic.test/login?next=/workspace/wiki'
      )
    ).then((response) => {
      settled = true;
      return response;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish({
      ok: true,
      claims: { sub: 'synthetic' },
      response: cookieResponse,
      requestHeaders,
    });
    const response = await pending;
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://lettin.synthetic.test/workspace/wiki'
    );
    expect(await response.text()).toBe('');
    expect(mocks[marker]).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(mocks.propagate).toHaveBeenCalledWith(cookieResponse, response);
    expect(mocks.refresh).toHaveBeenCalledWith(expect.any(NextRequest), {
      requireWebAppSession: true,
      sessionMode: 'supabase-first',
      targetApp: 'lettin',
    });
  }
);

it('forces central login for explicit refresh without trusting old claims', async () => {
  mocks.web.mockReturnValue(true);
  const response = await getLoginRedirect(
    new NextRequest(
      'https://lettin.synthetic.test/login?next=/workspace&refresh=1'
    )
  );
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!).origin).toBe(
    'https://web.synthetic.test'
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each(['MFA required', 'Account assurance unavailable'])(
  'does not admit shared markers when verification fails: %s',
  async (error) => {
    mocks.web.mockReturnValue(true);
    mocks.refresh.mockResolvedValue({ ok: false, error });
    const response = await getLoginRedirect(
      new NextRequest('https://lettin.synthetic.test/login')
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).origin).toBe(
      'https://web.synthetic.test'
    );
  }
);

it('does not admit app claims without a shared browser marker', async () => {
  mocks.refresh.mockResolvedValue({
    ok: true,
    claims: { sub: 'synthetic' },
    response: NextResponse.next(),
  });
  const response = await getLoginRedirect(
    new NextRequest('https://lettin.synthetic.test/login')
  );
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!).origin).toBe(
    'https://web.synthetic.test'
  );
});

it.each([
  'https://hostile.synthetic.test/private',
  '//hostile.synthetic.test/private',
  '/login',
])('normalizes an unsafe or looping destination %s', async (next) => {
  const request = new URL('https://lettin.synthetic.test/login');
  request.searchParams.set('next', next);
  const response = await getLoginRedirect(new NextRequest(request));
  const location = new URL(response.headers.get('location')!);
  expect(response.status).toBe(307);
  expect(
    new URL(location.searchParams.get('returnUrl')!).searchParams.get('nextUrl')
  ).toBe('/');
});

it('preserves failure response cookie headers without assuming NextResponse', async () => {
  const failed = new Response(null, {
    headers: { 'set-cookie': 'synthetic-recovery=ready; Path=/; HttpOnly' },
  });
  mocks.refresh.mockResolvedValue({
    ok: false,
    error: 'MFA required',
    response: failed,
  });
  const response = await getLoginRedirect(
    new NextRequest('https://lettin.synthetic.test/login')
  );
  expect(response.status).toBe(307);
  expect(response.headers.getSetCookie()).toContain(
    'synthetic-recovery=ready; Path=/; HttpOnly'
  );
  expect(mocks.propagate).not.toHaveBeenCalled();
});
