import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routeStatus: vi.fn(),
  refresh: vi.fn(),
  stale: vi.fn(),
  webSession: vi.fn(),
  supabaseSession: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_COOKIE_NAME: 'app',
  APP_SESSION_REFRESH_COOKIE_NAME: 'refresh',
  WEB_APP_SESSION_COOKIE_NAME: 'web',
  WEB_APP_SESSION_REFRESH_COOKIE_NAME: 'web-refresh',
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: mocks.stale,
  hasSupportedSupabaseAuthCookie: mocks.supabaseSession,
  hasWebAppSessionTokenFromRequest: mocks.webSession,
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual('../../../packages/auth/src/proxy/redirect-path')),
  // Exercise the real failure response without loading the unused Supabase refresh stack.
  ...(await vi.importActual('../../../packages/auth/src/proxy/mfa-failure')),
  refreshAppSessionForRequest: mocks.refresh,
  consumeVerifyTokenRequest: async () => null,
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
}));
vi.mock('@tuturuuu/utils/shared-cookie', () => ({
  getTuturuuuSharedCookieOptions: (options: unknown) => options,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('./workspace-route-status', () => ({
  getWorkspaceRouteStatus: mocks.routeStatus,
}));

import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.routeStatus.mockResolvedValue(null);
  mocks.stale.mockReturnValue({ sub: 'stale-user' });
  mocks.webSession.mockReturnValue(true);
  mocks.supabaseSession.mockReturnValue(true);
});
it('rejects stale page claims when shared identity requires MFA', async () => {
  mocks.refresh.mockResolvedValue({ ok: false, error: 'MFA required' });
  const response = await proxy(
    new NextRequest('https://lettin.tuturuuu.com/workspace/worlds/world')
  );
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get('location')!);
  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('refresh')).toBe('1');
  expect(location.searchParams.get('next')).toBe('/workspace/worlds/world');
  expect(mocks.stale).not.toHaveBeenCalled();
});
it('admits a successfully refreshed shared session', async () => {
  mocks.refresh.mockResolvedValue({
    ok: true,
    claims: { sub: 'verified-user' },
    response: NextResponse.next(),
  });
  expect(
    (await proxy(new NextRequest('https://lettin.tuturuuu.com/workspace')))
      .status
  ).toBe(200);
});
it('denies protected API access when MFA is required', async () => {
  mocks.refresh.mockResolvedValue({ ok: false, error: 'MFA required' });
  expect(
    (
      await proxy(
        new NextRequest(
          'https://lettin.tuturuuu.com/api/v1/workspaces/id/lettin'
        )
      )
    ).status
  ).toBe(403);
});

it('allows anonymous space discovery without refreshing a protected session', async () => {
  mocks.refresh.mockResolvedValue({ ok: false, error: 'MFA required' });
  const response = await proxy(
    new NextRequest('https://lettin.tuturuuu.com/spaces')
  );
  expect(response.status).toBe(200);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it('keeps workspace creative spaces protected', async () => {
  mocks.refresh.mockResolvedValue({ ok: false, error: 'MFA required' });
  const response = await proxy(
    new NextRequest('https://lettin.tuturuuu.com/workspace/spaces/art')
  );
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  expect(mocks.refresh).toHaveBeenCalled();
});

it.each([false, true])(
  'requires a shared browser session marker even with verified app claims (present=%s)',
  async (present) => {
    mocks.webSession.mockReturnValue(present);
    mocks.supabaseSession.mockReturnValue(false);
    mocks.refresh.mockResolvedValue({
      ok: true,
      claims: { sub: 'verified-user' },
      response: NextResponse.next(),
    });
    const response = await proxy(
      new NextRequest('https://lettin.tuturuuu.com/workspace/wiki')
    );
    expect(response.status).toBe(present ? 200 : 307);
    if (!present) {
      expect(new URL(response.headers.get('location')!).pathname).toBe(
        '/login'
      );
    }
    expect(mocks.refresh).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        requireWebAppSession: true,
        targetApp: 'lettin',
      })
    );
  }
);

it('resolves exact login requests as HTTP redirects before locale rendering', async () => {
  mocks.refresh.mockResolvedValue({ ok: false, error: 'Missing app session' });
  const response = await proxy(
    new NextRequest('https://lettin.tuturuuu.com/login')
  );
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  expect(await response.text()).toBe('');
});

it.each(['en', 'vi'])(
  'keeps the canonical %s login redirect before auth resolution',
  async (locale) => {
    const response = await proxy(
      new NextRequest(
        `https://lettin.tuturuuu.com/${locale}/login?next=/workspace/wiki&refresh=1`
      )
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://lettin.tuturuuu.com/login?next=/workspace/wiki&refresh=1'
    );
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe(locale);
    expect(mocks.refresh).not.toHaveBeenCalled();
  }
);

it('preserves pre-stream workspace status and refreshed auth headers', async () => {
  const headers = new Headers({ cookie: 'verified=1' });
  mocks.refresh.mockResolvedValue({
    ok: true,
    claims: { sub: 'verified' },
    requestHeaders: headers,
    response: NextResponse.next(),
  });
  mocks.routeStatus.mockResolvedValue(
    NextResponse.redirect('https://lettin.tuturuuu.com/dashboard')
  );
  const request = new NextRequest('https://lettin.tuturuuu.com/unjoined/wiki');
  expect((await proxy(request)).status).toBe(307);
  expect(mocks.routeStatus).toHaveBeenCalledWith(
    request,
    '/unjoined/wiki',
    headers,
    'en'
  );
});
