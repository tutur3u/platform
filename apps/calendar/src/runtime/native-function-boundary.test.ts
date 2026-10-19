import { isCsrfRequestAllowed } from '@tanstack/react-start';
import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const auth = vi.hoisted(() => ({
  refresh: vi.fn(),
  guard: vi.fn(),
  failure: vi.fn(),
  propagate: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: (request: Request) =>
    request.headers.has('cookie'),
  getAppSessionTokenFromRequest: () => null,
  getWebAppSessionTokenFromRequest: () => null,
  getAppSessionRefreshTokenFromRequest: () => null,
  getWebAppSessionRefreshTokenFromRequest: () => null,
}));
vi.mock('@tuturuuu/auth/proxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/auth/proxy')>()),
  preserveMfaRecoveryCookies: (_request: Request, response: Response) =>
    response,
  refreshAppSessionForRequest: auth.refresh,
  appSessionFailureResponse: auth.failure,
  propagateAuthCookies: auth.propagate,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: auth.guard,
}));

import { nativeFunctionProxy } from './native-function-proxy';

function request(method: string, headers: HeadersInit = {}) {
  return new NextRequest(
    'https://calendar.tuturuuu.com/_calendar/functions/fixture',
    {
      method,
      headers,
    }
  );
}

describe('native function boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.guard.mockResolvedValue(null);
  });

  it.each(['PUT', 'DELETE', 'PATCH'])(
    'rejects %s without session or API suppliers',
    async (method) => {
      expect((await nativeFunctionProxy(request(method))).status).toBe(405);
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.guard).not.toHaveBeenCalled();
    }
  );

  it.each(['text/plain', 'application/x-www-form-urlencoded', ''])(
    'rejects non-JSON POST %s before suppliers',
    async (type) => {
      expect(
        (await nativeFunctionProxy(request('POST', { 'content-type': type })))
          .status
      ).toBe(415);
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.guard).not.toHaveBeenCalled();
    }
  );

  it('admits anonymous JSON to the API guard without fabricating a session', async () => {
    expect(
      (
        await nativeFunctionProxy(
          request('POST', { 'content-type': 'application/json; charset=utf-8' })
        )
      ).headers.get('x-middleware-next')
    ).toBe('1');
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.guard).toHaveBeenCalledWith(expect.anything(), {
      prefixBase: 'proxy:calendar:functions',
    });
  });

  it('preserves refreshed session response and propagates cookies on guard denial', async () => {
    const sessionResponse = NextResponse.next();
    const denial = new NextResponse(null, { status: 429 });
    auth.refresh.mockResolvedValue({ ok: true, response: sessionResponse });
    auth.guard.mockResolvedValue(denial);
    expect(
      await nativeFunctionProxy(
        request('POST', {
          cookie: 'fixture=one',
          'content-type': 'application/json',
        })
      )
    ).toBe(denial);
    expect(auth.refresh).toHaveBeenCalledWith(expect.anything(), {
      sessionMode: 'supabase-first',
      targetApp: 'calendar',
    });
    expect(auth.propagate).toHaveBeenCalledWith(sessionResponse, denial);
  });

  it.each([
    [{ origin: 'https://calendar.tuturuuu.com' }, true],
    [{ origin: 'https://foreign.invalid' }, false],
    [{ 'sec-fetch-site': 'cross-site' }, false],
    [{ 'sec-fetch-site': 'same-origin' }, true],
    [{ referer: 'https://calendar.tuturuuu.com/plans/one' }, true],
    [{ referer: 'https://calendar.tuturuuu.com.foreign.invalid/' }, false],
    [{}, false],
  ] satisfies [HeadersInit, boolean][])(
    'uses the installed Start CSRF policy for %j',
    async (headers, expected) => {
      const dispatch = vi.fn(() => {
        throw new Error('CSRF predicate must not dispatch');
      });
      expect(
        await isCsrfRequestAllowed(
          {},
          {
            request: request('POST', headers),
            pathname: '/_calendar/functions/fixture',
            context: undefined,
            handlerType: 'serverFn',
            next: dispatch,
          }
        )
      ).toBe(expected);
      expect(dispatch).not.toHaveBeenCalled();
    }
  );
  it.each(['GET', 'POST'])(
    'carries locale and refreshed cookies through %s continuation',
    async (method) => {
      const refreshed = NextResponse.next();
      refreshed.cookies.set('app', 'rotated', { httpOnly: true });
      refreshed.cookies.set('refresh', 'rotated-refresh', { httpOnly: true });
      auth.refresh.mockResolvedValue({ ok: true, response: refreshed });
      const response = await nativeFunctionProxy(
        request(method, {
          cookie: 'NEXT_LOCALE=vi; app=before',
          'accept-language': 'en-US',
          'content-type': 'application/json',
        })
      );
      expect(
        response.headers.get('x-middleware-request-x-next-intl-locale')
      ).toBe('vi');
      expect(response.headers.get('x-middleware-request-cookie')).toContain(
        'NEXT_LOCALE=vi'
      );
      expect(response.headers.get('x-middleware-request-cookie')).toContain(
        'app=rotated'
      );
      expect(response.headers.get('x-middleware-request-cookie')).toContain(
        'refresh=rotated-refresh'
      );
      expect(response.headers.getSetCookie()).toEqual(
        refreshed.headers.getSetCookie()
      );
    }
  );
  it('carries Accept-Language-selected Vietnamese with no locale cookie', async () => {
    const response = await nativeFunctionProxy(
      request('GET', { 'accept-language': 'vi-VN,en;q=0.5' })
    );
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale')
    ).toBe('vi');
    expect(response.headers.get('x-middleware-request-accept-language')).toBe(
      'vi-VN,en;q=0.5'
    );
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
