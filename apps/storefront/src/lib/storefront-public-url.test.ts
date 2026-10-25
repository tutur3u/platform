// @vitest-environment node
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
