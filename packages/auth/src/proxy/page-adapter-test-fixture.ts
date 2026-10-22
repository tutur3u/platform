import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SESSION_REFRESH_COOKIE_NAME,
  createAppSessionTokenPair,
  getAppSessionClaimsFromRequest,
  WEB_APP_SESSION_COOKIE_NAME,
} from '../app-session';
import { resolveSignedAppSessionForRequest } from './signed-refresh';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<typeof import('./index').refreshAppSessionForRequest>(),
  continuation: vi.fn(),
  account: vi.fn(),
  factor: vi.fn(),
}));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual('./mfa-failure')),
  ...(await vi.importActual('./redirect-path')),
  refreshAppSessionForRequest: mocks.refresh,
  consumeVerifyTokenRequest: async () => null,
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.account } },
    rpc: mocks.factor,
  }),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
  hasAuthenticatedBearerToken: () => false,
  isTrustedProxyBypassRequest: () => false,
}));
// App-local mocks must resolve next-intl from the same workspace as the proxy.
export const pageAdapterMocks = mocks;

const start = new Date('2026-01-01T00:00:00Z');
const seconds = start.getTime() / 1000;
const at = (offset: number) => new Date(start.getTime() + offset * 1000);

// Shared behavior suite runs in each app's owning Vitest project. Signing,
// verification, required-MFA policy, and final deadline checks are real; provider,
// refresh transport, and locale rendering are isolated fixture boundaries.
export function definePageAdapterTests({
  proxy,
  targetApp,
  protectedPath = '/workspace/private',
  publicPaths = [],
  anonymousApis = [],
}: {
  proxy: (request: NextRequest) => Promise<NextResponse>;
  targetApp: string;
  protectedPath?: string;
  publicPaths?: string[];
  anonymousApis?: { path: string; method: string }[];
}) {
  function request(path = protectedPath, method = 'GET', cookies = true) {
    const pair = createAppSessionTokenPair(
      {
        userId: 'fixture-actor',
        targetApp,
        mfa: {
          sessionId: 'fixture-session',
          verifiedAt: seconds - 1,
          factorId: 'fixture-factor',
          expiresAt: seconds + 55,
        },
      },
      {
        now: start,
        policy: {
          internalAppAccessTtlSeconds: 60,
          internalAppRefreshEarlySeconds: 20,
          internalAppRefreshTtlSeconds: 3600,
        },
      }
    );
    return new NextRequest(`https://${targetApp}.example.test${path}`, {
      method,
      headers: cookies
        ? {
            cookie: `${WEB_APP_SESSION_COOKIE_NAME}=${pair.access.token}; ${APP_SESSION_REFRESH_COOKIE_NAME}=${pair.refresh.token}`,
          }
        : {},
    });
  }

  function expectLogin(response: NextResponse) {
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe(protectedPath);
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(mocks.continuation).not.toHaveBeenCalled();
  }

  describe(`${targetApp} page final authority`, () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(at(50));
      vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'synthetic-page-fixture');
      mocks.refresh.mockReset();
      mocks.continuation
        .mockReset()
        .mockImplementation(() => NextResponse.next());
      mocks.account.mockReset().mockResolvedValue({
        data: {
          user: {
            id: 'fixture-actor',
            app_metadata: {
              tuturuuu_required_mfa: {
                required: true,
                verifiedAfter: seconds - 10,
              },
            },
          },
        },
        error: null,
      });
      mocks.factor
        .mockReset()
        .mockResolvedValue({ data: 'fixture-factor', error: null });
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          throw new Error('Unexpected fixture network request');
        })
      );
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it.each(['Invalid app session refresh credentials', 'Token expired'])(
      'redirects after %s even though raw claims verify',
      async (error) => {
        const req = request();
        expect(getAppSessionClaimsFromRequest(req, { targetApp })?.sub).toBe(
          'fixture-actor'
        );
        mocks.refresh.mockResolvedValue({ ok: false, error });
        expectLogin(await proxy(req));
        expect(mocks.refresh).toHaveBeenCalledOnce();
      }
    );

    it.each([500, 'transport'] as const)(
      'does not re-admit proof expiring during refresh await (%s)',
      async (failure) => {
        const req = request();
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            vi.setSystemTime(at(56));
            if (failure === 'transport')
              throw new Error('Fixture refresh failure');
            return new Response(null, { status: failure });
          })
        );
        mocks.refresh.mockImplementation((incoming, options) =>
          resolveSignedAppSessionForRequest(
            incoming,
            options,
            () => new URL('https://central.example.test/refresh')
          )
        );
        expectLogin(await proxy(req));
        expect(await mocks.refresh.mock.results[0]?.value).toEqual({
          ok: false,
          error: 'Invalid app session refresh credentials',
        });
        expect(getAppSessionClaimsFromRequest(req, { targetApp })?.sub).toBe(
          'fixture-actor'
        );
        expect(req.headers.get('authorization')).toBeNull();
        expect(mocks.account).toHaveBeenCalledOnce();
        expect(mocks.factor).toHaveBeenCalledOnce();
      }
    );

    it('admits healthy access before refresh is due', async () => {
      vi.setSystemTime(at(10));
      const req = request();
      mocks.refresh.mockImplementation((incoming, options) =>
        resolveSignedAppSessionForRequest(
          incoming,
          options,
          () => new URL('https://central.example.test/refresh')
        )
      );
      const response = await proxy(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.continuation).toHaveBeenCalledOnce();
      expect(await mocks.refresh.mock.results[0]?.value).toMatchObject({
        ok: true,
        refreshed: false,
        claims: { sub: 'fixture-actor' },
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('admits valid fallback during a refresh outage', async () => {
      const req = request();
      mocks.refresh.mockImplementation((incoming, options) =>
        resolveSignedAppSessionForRequest(
          incoming,
          options,
          () => new URL('https://central.example.test/refresh')
        )
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status: 503 }))
      );
      const response = await proxy(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.continuation).toHaveBeenCalledOnce();
      expect(await mocks.refresh.mock.results[0]?.value).toMatchObject({
        ok: true,
        refreshed: false,
      });
    });

    it.each([
      ['MFA required', 403, 'MFA_REQUIRED'],
      [
        'App session refresh unavailable',
        503,
        'APP_SESSION_REFRESH_UNAVAILABLE',
      ],
      ['Account assurance unavailable', 503, 'AUTH_UNAVAILABLE'],
    ] as const)('preserves terminal %s', async (error, status, code) => {
      mocks.refresh.mockResolvedValue({ ok: false, error });
      const response = await proxy(request());
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ code });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(mocks.continuation).not.toHaveBeenCalled();
    });

    for (const path of publicPaths) {
      it(`preserves anonymous page ${path}`, async () => {
        const response = await proxy(request(path, 'GET', false));
        expect(response.status).toBe(200);
        expect(mocks.refresh).not.toHaveBeenCalled();
      });
    }
    for (const { path, method } of anonymousApis) {
      it.each([false, true])(
        `preserves ${method} ${path} with cookies=%s`,
        async (cookies) => {
          mocks.refresh.mockResolvedValue({
            ok: false,
            error: 'App session refresh unavailable',
          });
          const response = await proxy(request(path, method, cookies));
          expect(response.status).toBe(200);
          expect(response.headers.get('x-middleware-next')).toBe('1');
          expect(mocks.refresh).toHaveBeenCalledTimes(cookies ? 1 : 0);
        }
      );
    }
  });
}
