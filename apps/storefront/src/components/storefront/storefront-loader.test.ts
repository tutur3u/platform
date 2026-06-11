import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDemoCheckoutResponse,
  DEMO_ORDER_PUBLIC_TOKEN,
  DEMO_STOREFRONT_ID,
  demoPublicStorefront,
  getDemoOrderResponse,
} from './storefront-fixture';

const { getInventoryPublicStorefrontMock } = vi.hoisted(() => ({
  getInventoryPublicStorefrontMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/inventory', () => ({
  getInventoryPublicStorefront: getInventoryPublicStorefrontMock,
}));

import { getOptionalInventoryPublicStorefront } from './storefront-loader';

afterEach(() => {
  getInventoryPublicStorefrontMock.mockReset();
});

describe('getOptionalInventoryPublicStorefront', () => {
  it('returns the demo fixture when the demo public storefront API returns 404', async () => {
    getInventoryPublicStorefrontMock.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 })
    );

    await expect(getOptionalInventoryPublicStorefront('demo')).resolves.toEqual(
      demoPublicStorefront
    );
  });

  it('returns null when a non-demo public storefront API returns 404', async () => {
    getInventoryPublicStorefrontMock.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 })
    );

    await expect(
      getOptionalInventoryPublicStorefront('missing-shop')
    ).resolves.toBe(null);
  });

  it('returns a real demo storefront response when the public API succeeds', async () => {
    const realPayload = {
      bundles: [],
      listings: [],
      storefront: {
        ...demoPublicStorefront.storefront,
        id: 'real-demo-storefront',
      },
    };
    getInventoryPublicStorefrontMock.mockResolvedValue(realPayload);

    await expect(getOptionalInventoryPublicStorefront('demo')).resolves.toBe(
      realPayload
    );
  });

  it('throws non-404 storefront API errors', async () => {
    const error = Object.assign(new Error('Internal server error'), {
      status: 500,
    });
    getInventoryPublicStorefrontMock.mockRejectedValue(error);

    await expect(getOptionalInventoryPublicStorefront('demo')).rejects.toBe(
      error
    );
  });

  it('returns a local demo checkout URL and synthetic demo order', () => {
    expect(createDemoCheckoutResponse('demo')).toMatchObject({
      checkout: {
        publicToken: DEMO_ORDER_PUBLIC_TOKEN,
      },
      checkoutUrl: `/store/demo/orders/${DEMO_ORDER_PUBLIC_TOKEN}`,
    });

    expect(getDemoOrderResponse(DEMO_ORDER_PUBLIC_TOKEN)).toMatchObject({
      order: {
        publicToken: DEMO_ORDER_PUBLIC_TOKEN,
        status: 'reserved',
        wsId: expect.any(String),
      },
    });
    expect(demoPublicStorefront.storefront.id).toBe(DEMO_STOREFRONT_ID);
  });

  it('throws a 404-style error for unknown demo order tokens', () => {
    expect(() => getDemoOrderResponse('missing-token')).toThrow(
      'Demo order not found'
    );
  });
});
