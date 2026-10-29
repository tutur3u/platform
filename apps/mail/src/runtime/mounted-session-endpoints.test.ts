import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => {
  const provider = vi.fn();
  return {
    provider,
    handler: vi.fn(() => {
      provider();
      return Response.json(
        { success: true },
        {
          headers: {
            'set-cookie': 'tuturuuu_app_session=fixture; Path=/; HttpOnly',
          },
        }
      );
    }),
    proxy: vi.fn(),
    start: vi.fn(),
    assets: vi.fn(),
    fetch: vi.fn(),
    routing: vi.fn(),
  };
});

// Keep the real bridge, route matcher, proxy adapter and endpoint dispatcher.
// Only the application/provider boundaries use disposable fixture handlers.
vi.mock('../proxy', () => ({ proxy: calls.proxy }));
vi.mock('./api-registry.bridge.gen', () => ({
  endpoints: [
    {
      pattern: '/api/auth/logout',
      module: { GET: calls.handler, POST: calls.handler },
    },
    {
      pattern: '/api/auth/refresh-app-session',
      module: { POST: calls.handler },
    },
    { pattern: '/api/auth/verify-app-token', module: { POST: calls.handler } },
  ],
}));
vi.mock('./mail-api-server', () => ({ registerMailServerApiPaths: () => {} }));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: calls.start }),
}));

vi.mock('@tuturuuu/utils/one-origin-routing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/one-origin-routing')>();
  return {
    ...actual,
    decideOneOriginRequest: (
      ...args: Parameters<typeof actual.decideOneOriginRequest>
    ) => {
      calls.routing();
      return actual.decideOneOriginRequest(...args);
    },
  };
});

import { handleMailRequest } from './handler';

const env = { ASSETS: { fetch: calls.assets } };
const ctx = { waitUntil: () => {} };
const cases = [
  { endpoint: 'logout', method: 'GET' },
  { endpoint: 'logout', method: 'HEAD' },
  { endpoint: 'logout', method: 'POST' },
  { endpoint: 'logout', method: 'OPTIONS' },
  { endpoint: 'refresh-app-session', method: 'POST' },
  { endpoint: 'refresh-app-session', method: 'OPTIONS' },
  { endpoint: 'verify-app-token', method: 'POST' },
  { endpoint: 'verify-app-token', method: 'OPTIONS' },
];
const variants = ['/api/auth/', '/api//auth/', '/api/auth//', '//api///auth/'];

beforeEach(() => {
  vi.clearAllMocks();
  calls.proxy.mockResolvedValue(NextResponse.next());
  vi.stubGlobal('fetch', calls.fetch);
});
afterEach(() => vi.unstubAllGlobals());

for (const host of ['tuturuuu.com', 'web.staging.tutur3u.com']) {
  for (const mode of ['off', 'shadow', 'on']) {
    for (const prefix of variants) {
      for (const suffix of ['', '/', '///?next=%2Fmail%2Flogin']) {
        it.each(cases)(
          `rejects ${host} ${mode} mounted $method $endpoint (${prefix}<endpoint>${suffix}) before routing and dispatch`,
          async ({ endpoint, method }) => {
            const runtimeEnv = { ...env, TTR_ONE_ORIGIN_MAIL: mode };
            const response = await handleMailRequest(
              new Request(`https://${host}/mail${prefix}${endpoint}${suffix}`, {
                method,
                headers: { cookie: 'sb-fixture-auth-token=shared' },
              }),
              runtimeEnv,
              ctx
            );
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({
              error: 'The shared session is managed by Web',
            });
            expect(response.headers.getSetCookie()).toEqual([]);
            expect(response.headers.get('x-frame-options')).toBe('DENY');
            for (const call of Object.values(calls))
              expect(call).not.toHaveBeenCalled();
          }
        );
      }
    }
  }
}

for (const prefix of variants.slice(0, 3)) {
  for (const suffix of ['', '/']) {
    it.each(cases)(
      `retains real subdomain dispatch for $method $endpoint (${prefix}<endpoint>${suffix})`,
      async ({ endpoint, method }) => {
        const response = await handleMailRequest(
          new Request(
            `https://mail.tuturuuu.com${prefix}${endpoint}${suffix}`,
            { method }
          ),
          env,
          ctx
        );
        expect(response.status).toBe(method === 'OPTIONS' ? 204 : 200);
        if (method === 'OPTIONS') {
          expect(response.headers.getSetCookie()).toEqual([]);
          expect(calls.handler).not.toHaveBeenCalled();
          expect(calls.provider).not.toHaveBeenCalled();
        } else {
          expect(response.headers.getSetCookie()).toEqual([
            'tuturuuu_app_session=fixture; Path=/; HttpOnly',
          ]);
          expect(calls.handler).toHaveBeenCalledTimes(1);
          expect(calls.provider).toHaveBeenCalledTimes(1);
          if (method === 'HEAD') expect(await response.text()).toBe('');
        }
        expect(calls.routing).toHaveBeenCalledTimes(1);
        expect(calls.routing.mock.invocationCallOrder[0]).toBeLessThan(
          calls.proxy.mock.invocationCallOrder[0] ?? 0
        );
        expect(calls.proxy).toHaveBeenCalledTimes(1);
        expect(calls.start).not.toHaveBeenCalled();
        expect(calls.assets).not.toHaveBeenCalled();
        expect(calls.fetch).not.toHaveBeenCalled();
      }
    );
  }
}

it.each([
  'logout-other',
  'logout/extra',
  'logout%2F',
  '%6cogout',
  'LOGOUT',
  'refresh-app-session-other',
  'verify-app-token-other',
])('leaves the neighbouring mounted %s route to dispatch', async (endpoint) => {
  const response = await handleMailRequest(
    new Request(`https://web.staging.tutur3u.com/mail/api/auth/${endpoint}`),
    env,
    ctx
  );
  expect(response.status).toBe(404);
  expect(calls.routing).toHaveBeenCalledTimes(1);
  expect(calls.proxy).toHaveBeenCalledTimes(1);
  expect(calls.handler).not.toHaveBeenCalled();
  expect(calls.provider).not.toHaveBeenCalled();
  expect(response.headers.getSetCookie()).toEqual([]);
});

it.each(['off', 'shadow', 'on'])(
  'keeps the unqualified shared-origin mount refused in %s mode',
  async (mode) => {
    const runtimeEnv = { ...env, TTR_ONE_ORIGIN_MAIL: mode };
    const response = await handleMailRequest(
      new Request('https://tuturuuu.com/mail/login'),
      runtimeEnv,
      ctx
    );
    expect(response.status).toBe(404);
    expect(calls.routing).toHaveBeenCalledTimes(1);
    expect(calls.proxy).not.toHaveBeenCalled();
    expect(calls.start).not.toHaveBeenCalled();
  }
);

it.each([
  'https://tuturuuu.com/api/auth/logout',
  'https://tuturuuu.com/mailbox/api/auth/logout',
  'https://web.staging.tutur3u.com/calendar/api/auth/logout',
])('rejects the unowned path %s before routing or dispatch', async (url) => {
  const response = await handleMailRequest(new Request(url), env, ctx);
  expect(response.status).toBe(404);
  for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
});

it.each(['DELETE', 'PUT', 'PATCH'])(
  'rejects unsupported mounted session %s before routing',
  async (method) => {
    const response = await handleMailRequest(
      new Request('https://tuturuuu.com/mail/api/auth/logout', { method }),
      env,
      ctx
    );
    expect(response.status).toBe(409);
    for (const call of Object.values(calls))
      expect(call).not.toHaveBeenCalled();
  }
);

it.each([
  'https://mail.tuturuuu.com/login',
  'https://web.staging.tutur3u.com/mail/login',
])(
  'keeps document security headers after bridge dispatch on %s',
  async (url) => {
    calls.start.mockResolvedValueOnce(
      new Response('<!doctype html><title>Mail</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );
    const response = await handleMailRequest(new Request(url), env, ctx);
    expect(response.status).toBe(200);
    expect(calls.routing).toHaveBeenCalledTimes(1);
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(
      response.headers.get('content-security-policy-report-only')
    ).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
);
