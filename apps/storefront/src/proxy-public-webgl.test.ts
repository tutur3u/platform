// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guard, refresh } = vi.hoisted(() => ({
  guard: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: guard,
  hasAuthenticatedBearerToken: () => false,
  isTrustedProxyBypassRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  appSessionFailureResponse: () =>
    NextResponse.json({ error: 'Missing app session' }, { status: 401 }),
  consumeVerifyTokenRequest: vi.fn(),
  preserveMfaRecoveryCookies: (_request: NextRequest, response: NextResponse) =>
    response,
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: refresh,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/navigation', () => ({ createNavigation: () => ({}) }));

import { proxy } from './proxy';

function request(path: string, method = 'GET', credentials = false) {
  return new NextRequest(`https://storefront.example.test${path}`, {
    method,
    headers: credentials
      ? { cookie: 'stale=fixture', authorization: 'Bearer invalid-fixture' }
      : {},
  });
}

const WEBGL =
  '/api/v1/workspaces/fixture/external-projects/assets/fixture/webgl';

describe('published WebGL asset delivery', () => {
  beforeEach(() => {
    guard.mockReset().mockResolvedValue(null);
    refresh
      .mockReset()
      .mockResolvedValue({ ok: false, error: 'Missing app session' });
  });

  it.each([
    ['GET', WEBGL],
    ['GET', `${WEBGL}/index.html`],
    ['HEAD', `${WEBGL}/Build/game.wasm.br`],
  ])(
    'passes signed-out %s %s through behind the API guard',
    async (method, path) => {
      for (const credentials of [false, true]) {
        const req = request(path, method, credentials);
        const response = await proxy(req);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(guard).toHaveBeenLastCalledWith(req, {
          prefixBase: 'proxy:storefront:api',
        });
        expect(refresh).not.toHaveBeenCalled();
        if (credentials) {
          expect(req.headers.get('cookie')).toBe('stale=fixture');
        }
      }
    }
  );

  it('preserves an API guard denial', async () => {
    const denied = NextResponse.json(
      { error: 'Rate limited' },
      { status: 429 }
    );
    guard.mockResolvedValueOnce(denied);
    expect(await proxy(request(`${WEBGL}/game.js`))).toBe(denied);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', `${WEBGL}/game.js`],
    ['GET', '/api/storefront-probe.json'],
    ['GET', '/api/v1/workspaces/fixture/tasks/export.json'],
    [
      'GET',
      '/api/v1/workspaces/fixture/external-projects/assets/fixture/webgl-other/game.js',
    ],
    ['GET', '/api/v1/workspaces/fixture/external-projects/assets/webgl'],
  ])('requires a session for %s %s', async (method, path) => {
    const response = await proxy(request(path, method, true));
    expect(response.status).toBe(401);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
