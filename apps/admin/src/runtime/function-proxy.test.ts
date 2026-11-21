import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shared: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../../../packages/start-bridge/src/next/function-proxy', () => ({
  createFunctionProxy: () => mocks.shared,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: mocks.refresh,
  propagateAuthCookies: (source: Response, target: Response) => {
    for (const cookie of source.headers.getSetCookie())
      target.headers.append('set-cookie', cookie);
  },
}));
import { createFunctionProxy } from './function-proxy';

const PROVIDER = 'sb-fixture-auth-token';
const FRESH = `${PROVIDER}.0=fresh; Path=/; Max-Age=3600`;
const proxy = () => createFunctionProxy({ targetApp: 'infrastructure' });

function mounted(headers: Record<string, string> = {}) {
  return new NextRequest('https://tuturuuu.com/admin/_serverFn/id', {
    nextConfig: { basePath: '/admin' },
    headers: { cookie: `${PROVIDER}.0=current`, ...headers },
  });
}

function withCookies(response: NextResponse, ...cookies: string[]) {
  for (const cookie of cookies) response.headers.append('set-cookie', cookie);
  return response;
}

describe('Admin mounted server-function authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shared.mockResolvedValue(NextResponse.next());
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
  });

  it('resolves the provider-only session before dispatching an Admin action', async () => {
    const req = mounted({ authorization: 'Bearer fixture' });
    const response = await proxy()(req);
    expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(req, {
      sessionMode: 'supabase-only',
      targetApp: 'infra',
    });
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('refuses a cookie-less provider bearer before dispatch', async () => {
    const req = new NextRequest('https://tuturuuu.com/admin/_serverFn/id', {
      nextConfig: { basePath: '/admin' },
      headers: { authorization: 'Bearer not-a-coordination-token' },
    });
    const response = await proxy()(req);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
  });

  it.each([
    ['Shared session unavailable', 401],
    ['MFA required', 403],
    ['Account assurance unavailable', 503],
  ])(
    'answers a %s refusal without running the action or expiring Web cookies',
    async (error, status) => {
      mocks.refresh.mockResolvedValue({
        ok: false,
        error,
        response: withCookies(
          NextResponse.next(),
          'sb-otherprojectref-auth-token=; Path=/; Max-Age=0'
        ),
      });
      const response = await proxy()(mounted());
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(
        response.headers
          .getSetCookie()
          .filter((cookie) => /Max-Age=0/u.test(cookie))
      ).toEqual([]);
      expect(mocks.shared).not.toHaveBeenCalled();
    }
  );

  it('drops the shared proxy cookie clearing from a mounted response', async () => {
    mocks.shared.mockResolvedValue(
      withCookies(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
        `${PROVIDER}-legacy=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`
      )
    );
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: withCookies(NextResponse.next(), FRESH),
    });
    const response = await proxy()(mounted());
    expect(response.status).toBe(429);
    expect(response.headers.getSetCookie()).toEqual([FRESH]);
  });

  it('keeps the legacy host on the shared proxy unchanged', async () => {
    const req = new NextRequest(
      'https://infrastructure.tuturuuu.com/_serverFn/id'
    );
    const response = await proxy()(req);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
