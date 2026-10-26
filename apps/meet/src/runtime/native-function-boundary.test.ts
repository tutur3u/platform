import { isCsrfRequestAllowed } from '@tanstack/react-start';
import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@tuturuuu/auth/proxy', () => ({
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
  return new NextRequest('https://meet.tuturuuu.com/_fn/fixture', {
    method,
    headers,
  });
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
      prefixBase: 'proxy:meet:functions',
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
      targetApp: 'meet',
    });
    expect(auth.propagate).toHaveBeenCalledWith(sessionResponse, denial);
  });

  it.each([
    [{ origin: 'https://meet.tuturuuu.com' }, true],
    [{ origin: 'https://foreign.invalid' }, false],
    [{ 'sec-fetch-site': 'cross-site' }, false],
    [{ 'sec-fetch-site': 'same-origin' }, true],
    [{ referer: 'https://meet.tuturuuu.com/plans/one' }, true],
    [{ referer: 'https://meet.tuturuuu.com.foreign.invalid/' }, false],
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
            pathname: '/_fn/fixture',
            context: undefined,
            handlerType: 'serverFn',
            next: dispatch,
          }
        )
      ).toBe(expected);
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it('returns the canonical expired-session failure before API dispatch', async () => {
    const incoming = request('POST', {
      cookie: 'fixture=expired',
      'content-type': 'application/json',
    });
    const sessionResponse = NextResponse.next();
    const failure = new NextResponse('session expired', { status: 401 });
    auth.refresh.mockResolvedValue({
      ok: false,
      error: 'fixture-expired',
      response: sessionResponse,
    });
    auth.failure.mockReturnValue(failure);
    expect(await nativeFunctionProxy(incoming)).toBe(failure);
    expect(auth.failure).toHaveBeenCalledWith(
      incoming,
      'fixture-expired',
      sessionResponse
    );
    expect(auth.guard).not.toHaveBeenCalled();
    expect(auth.propagate).not.toHaveBeenCalled();
  });

  it('preserves anonymous API-guard denial without refreshing or propagating a fabricated session', async () => {
    const denial = new NextResponse('limited', { status: 429 });
    auth.guard.mockResolvedValue(denial);
    expect(
      await nativeFunctionProxy(
        request('POST', { 'content-type': 'application/json' })
      )
    ).toBe(denial);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.propagate).not.toHaveBeenCalled();
  });
});
