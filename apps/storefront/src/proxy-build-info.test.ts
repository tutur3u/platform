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

describe('public build identity', () => {
  beforeEach(() => {
    guard.mockReset().mockResolvedValue(null);
    refresh
      .mockReset()
      .mockResolvedValue({ ok: false, error: 'Missing app session' });
  });

  it.each(['GET', 'HEAD'])(
    'admits exact %s without refreshing ambient identity',
    async (method) => {
      for (const credentials of [false, true]) {
        const req = request('/api/build-info', method, credentials);
        const response = await proxy(req);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(req.headers.get('cookie')).toBeNull();
        expect(req.headers.get('authorization')).toBeNull();
        expect(req.cookies.getAll()).toEqual([]);
        expect(guard).toHaveBeenLastCalledWith(req, {
          prefixBase: 'proxy:storefront:api',
        });
        expect(refresh).not.toHaveBeenCalled();
      }
    }
  );

  it('preserves an API guard denial', async () => {
    const denied = NextResponse.json(
      { error: 'Rate limited' },
      { status: 429 }
    );
    guard.mockResolvedValueOnce(denied);
    expect(await proxy(request('/api/build-info'))).toBe(denied);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/build-info', 'POST'],
    ['/api/build-info/private', 'GET'],
    ['/api/build-info-extra', 'GET'],
    ['/api/workspaces/private', 'GET'],
  ])('requires a session for %s %s', async (path, method) => {
    const req = request(path, method, true);
    const response = await proxy(req);
    expect(response.status).toBe(401);
    expect(refresh).toHaveBeenCalledOnce();
    expect(req.headers.get('cookie')).toBe('stale=fixture');
    expect(req.headers.get('authorization')).toBe('Bearer invalid-fixture');
  });
});
