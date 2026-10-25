// @vitest-environment node
import '../start-bridge/app-base';
import { getInventoryPublicStorefront } from '@tuturuuu/internal-api/inventory';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { expect, it, vi } from 'vitest';
import { createStorefrontPublicUrl } from './storefront-public-url';

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://storefront.tuturuuu.com',
}));

it('keeps concurrent mounted and subdomain verifier URLs request-local', async () => {
  await Promise.all(
    [
      { origin: 'https://storefront.tuturuuu.com', appBase: '' },
      { origin: 'https://tuturuuu.com', appBase: '/storefront' },
    ].map(({ origin, appBase }) =>
      withBridgeRequest(
        { request: new Request(`${origin}${appBase}/shop/checkout`), appBase },
        async () => {
          await Promise.resolve();
          expect(createStorefrontPublicUrl('/verify-token')).toEqual(
            new URL(`${appBase}/verify-token`, origin)
          );
        }
      )
    )
  );
});

it('retains the configured legacy verifier URL outside the bridge', () => {
  expect(createStorefrontPublicUrl('/verify-token')).toEqual(
    new URL('https://storefront.tuturuuu.com/verify-token')
  );
});

it('routes mounted browser inventory calls through the app while preserving explicit SSR origins', async () => {
  vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://tuturuuu.com');
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
  try {
    await withBridgeRequest(
      {
        request: new Request('https://tuturuuu.com/storefront/shop'),
        appBase: '/storefront',
      },
      async () => {
        await getInventoryPublicStorefront('shop', { fetch: fetcher });
        await getInventoryPublicStorefront('shop', {
          fetch: fetcher,
          baseUrl: 'https://inventory.example.test',
        });
      }
    );
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://tuturuuu.com/storefront/api/v1/inventory/storefronts/shop',
      'https://inventory.example.test/api/v1/inventory/storefronts/shop',
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});
