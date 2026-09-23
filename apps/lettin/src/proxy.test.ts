import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), stale: vi.fn() }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_COOKIE_NAME: 'app',
  APP_SESSION_REFRESH_COOKIE_NAME: 'refresh',
  WEB_APP_SESSION_COOKIE_NAME: 'web',
  WEB_APP_SESSION_REFRESH_COOKIE_NAME: 'web-refresh',
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: mocks.stale,
  hasSupportedSupabaseAuthCookie: () => true,
  hasWebAppSessionTokenFromRequest: () => true,
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
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

import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stale.mockReturnValue({ sub: 'stale-user' });
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
