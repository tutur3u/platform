// @vitest-environment node
import { NextResponse } from '@tuturuuu/start-bridge/next/server';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { afterEach, expect, it, vi } from 'vitest';
import appConfig from '../../start-bridge.config';

vi.mock('@/constants/common', () => ({
  INVENTORY_APP_URL: 'https://inventory.tuturuuu.com',
}));

afterEach(() => vi.unstubAllGlobals());

it('forwards mounted Inventory APIs to Inventory and other APIs to root Web', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response('upstream', {
        headers: { 'Set-Cookie': 'tuturuuu_session=fixture; Path=/' },
      })
  );
  vi.stubGlobal('fetch', fetcher);
  const handler = createBridgeHandler({
    mounts: {
      app: 'storefront',
      rootHosts: ['storefront.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/storefront',
    },
    proxy: async () => NextResponse.next(),
    start: {
      fetch: async () => new Response('unexpected page', { status: 500 }),
    },
    apiOrigin: appConfig.apiOrigin,
    assets: () => undefined,
    centralApiOrigin: () => 'https://tuturuuu.com',
  });
  const env = {
    INTERNAL_WEB_API_ORIGIN: 'https://tuturuuu.com',
    INVENTORY_APP_URL: 'https://inventory.example.test',
  };
  const ctx = { waitUntil() {} };
  for (const path of [
    '/api/v1/inventory/storefronts/shop?tag=one&tag=two',
    '/api/v1/workspaces/one/tasks',
  ]) {
    const response = await handler(
      new Request(`https://tuturuuu.com/storefront${path}`),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      'tuturuuu_session=fixture; Path=/',
    ]);
  }
  expect(
    fetcher.mock.calls.map(([request]) =>
      request instanceof Request ? request.url : String(request)
    )
  ).toEqual([
    'https://inventory.example.test/api/v1/inventory/storefronts/shop?tag=one&tag=two',
    'https://tuturuuu.com/api/v1/workspaces/one/tasks',
  ]);
});
