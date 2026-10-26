import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  guard: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  refreshAppSessionForRequest: mocks.refresh,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

const protectedRequests = [
  ...['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => ({
    method,
    path: '/api/build-info',
  })),
  ...[
    '/api/build-info/',
    '/api/build-info-extra',
    '/api/build-info/private',
    '/api/BUILD-INFO',
    '/api/build-info.json',
    '/api/private',
  ].flatMap((path) => ['GET', 'HEAD'].map((method) => ({ method, path }))),
];

function request(path: string, method: string) {
  return new NextRequest(`https://inventory.tuturuuu.com${path}`, {
    method,
    headers: {
      authorization: 'Bearer invalid.fixture.credentials',
      cookie: 'tuturuuu_app_session=expired-fixture; unrelated=fixture',
    },
  });
}

describe('inventory public build metadata boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(null);
    mocks.refresh.mockResolvedValue({
      ok: false,
      error: 'Account assurance unavailable',
    });
  });

  it.each(['GET', 'HEAD'])(
    'admits exact public %s without ambient identity or session refresh',
    async (method) => {
      const req = request('/api/build-info?verify=source', method);
      const response = await proxy(req);

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(req.cookies.getAll()).toEqual([]);
      expect(req.headers.has('cookie')).toBe(false);
      expect(req.headers.has('authorization')).toBe(false);
      expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
      expect(
        response.headers.get('x-middleware-request-authorization')
      ).toBeNull();
      expect(mocks.guard).toHaveBeenCalledWith(
        req,
        expect.objectContaining({ prefixBase: 'proxy:inventory:api' })
      );
    }
  );

  it.each(protectedRequests)(
    'keeps $method $path behind session assurance',
    async ({ method, path }) => {
      const req = request(path, method);
      const response = await proxy(req);

      expect(response.status).toBe(503);
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(mocks.guard).not.toHaveBeenCalled();
      expect(req.headers.get('authorization')).toBe(
        'Bearer invalid.fixture.credentials'
      );
    }
  );

  it.each(protectedRequests)(
    'retains the API guard for $method $path after session assurance',
    async ({ method, path }) => {
      mocks.refresh.mockResolvedValue({
        ok: true,
        response: NextResponse.next(),
      });
      const denied = NextResponse.json(
        { error: 'Guard denied' },
        { status: 403 }
      );
      mocks.guard.mockResolvedValue(denied);

      expect(await proxy(request(path, method))).toBe(denied);
      expect(mocks.guard).toHaveBeenCalledOnce();
    }
  );

  it.each(['GET', 'HEAD'])(
    'retains the API guard for public metadata %s',
    async (method) => {
      const denied = NextResponse.json(
        { error: 'Guard denied' },
        { status: 403 }
      );
      mocks.guard.mockResolvedValue(denied);
      expect(await proxy(request('/api/build-info', method))).toBe(denied);
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );
});
