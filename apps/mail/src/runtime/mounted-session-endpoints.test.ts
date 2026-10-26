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

for (const prefix of variants) {
  for (const suffix of ['', '/', '///']) {
    it.each(cases)(
      `rejects mounted $method $endpoint (${prefix}<endpoint>${suffix}) before dispatch`,
      async ({ endpoint, method }) => {
        const response = await handleMailRequest(
          new Request(
            `https://tuturuuu.com/mail${prefix}${endpoint}${suffix}`,
            {
              method,
              headers: { cookie: 'sb-fixture-auth-token=shared' },
            }
          ),
          env,
          ctx
        );
        expect(response.status).toBe(409);
        expect(response.headers.getSetCookie()).toEqual([]);
        for (const call of Object.values(calls))
          expect(call).not.toHaveBeenCalled();
      }
    );
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
        expect(calls.proxy).toHaveBeenCalledTimes(1);
        expect(calls.start).not.toHaveBeenCalled();
        expect(calls.assets).not.toHaveBeenCalled();
        expect(calls.fetch).not.toHaveBeenCalled();
      }
    );
  }
}

it('leaves neighbouring mounted routes to their own dispatch policy', async () => {
  const response = await handleMailRequest(
    new Request('https://tuturuuu.com/mail/api/auth/logout-other'),
    env,
    ctx
  );
  expect(response.status).toBe(404);
  expect(calls.proxy).toHaveBeenCalledTimes(1);
  expect(calls.handler).not.toHaveBeenCalled();
  expect(calls.provider).not.toHaveBeenCalled();
  expect(response.headers.getSetCookie()).toEqual([]);
});
