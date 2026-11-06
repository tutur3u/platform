import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withBridgeRequest } from '../server/request-context';

const auth = vi.hoisted(() => ({ refresh: vi.fn(), guard: vi.fn() }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: (request: Request) =>
    request.headers.has('cookie'),
  getAppSessionTokenFromRequest: () => null,
  getWebAppSessionTokenFromRequest: () => null,
  getAppSessionRefreshTokenFromRequest: () => null,
  getWebAppSessionRefreshTokenFromRequest: () => null,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: auth.refresh,
  appSessionFailureResponse: vi.fn(),
  propagateAuthCookies: vi.fn(),
  preserveMfaRecoveryCookies: (_request: Request, response: Response) =>
    response,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: auth.guard,
}));

import { createFunctionProxy } from './function-proxy';

const proxy = createFunctionProxy({ targetApp: 'meet' });
type Init = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
const call = (url: string, appBase: string, init: Init = {}) => {
  const request = new NextRequest(url, {
    headers: {
      cookie: 'sb-ref-auth-token=x',
      'content-type': 'application/json',
    },
    ...init,
  });
  return withBridgeRequest({ request, appBase }, () => proxy(request));
};

describe('function proxy session handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.guard.mockResolvedValue(null);
    const refreshed = NextResponse.next();
    refreshed.cookies.set('tuturuuu_app_session', 'fresh', { path: '/' });
    auth.refresh.mockResolvedValue({ ok: true, response: refreshed });
  });

  it('refreshes the satellite session at a host root', async () => {
    const response = await call('https://meet.tuturuuu.com/_serverFn/x', '', {
      method: 'POST',
      body: '{}',
    });
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(response.headers.getSetCookie()).toEqual([
      'tuturuuu_app_session=fresh; Path=/',
    ]);
  });

  it('never refreshes or writes cookies for a mounted request', async () => {
    const response = await call(
      'https://tuturuuu.com/meet/_serverFn/x',
      '/meet',
      {
        method: 'POST',
        body: '{}',
      }
    );
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.guard).toHaveBeenCalledOnce();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps method, content-type and guard checks for mounted requests', async () => {
    expect(
      (
        await call('https://tuturuuu.com/meet/_serverFn/x', '/meet', {
          method: 'PUT',
        })
      ).status
    ).toBe(405);
    expect(
      (
        await call('https://tuturuuu.com/meet/_serverFn/x', '/meet', {
          method: 'POST',
          body: 'a=1',
          headers: {
            'content-type': 'text/plain',
            cookie: 'sb-ref-auth-token=x',
          },
        })
      ).status
    ).toBe(415);
    auth.guard.mockResolvedValue(new NextResponse(null, { status: 429 }));
    expect(
      (await call('https://tuturuuu.com/meet/_serverFn/x', '/meet')).status
    ).toBe(429);
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
