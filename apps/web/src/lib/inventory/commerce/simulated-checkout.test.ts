import type { InventoryPublicStorefrontResponse } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import {
  createSimulatedCheckoutResponse,
  createSimulatedOrderToken,
  getSimulatedOrderResponse,
  verifySimulatedOrderToken,
} from './simulated-checkout';

const tokenPayload = {
  currency: 'USD',
  customerEmail: 'buyer@example.com',
  customerName: 'Buyer',
  storeSlug: 'shop',
  subtotalAmount: 5000,
  totalAmount: 5000,
  wsId: 'workspace-1',
};

describe('simulated checkout tokens', () => {
  it('rejects forged simulated order tokens', () => {
    expect(
      verifySimulatedOrderToken('simulated-order-anything', {
        secret: 'test-secret',
      })
    ).toMatchObject({
      error: 'malformed_token',
      ok: false,
    });
  });

  it('returns simulated order details only for signed tokens', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    const token = createSimulatedOrderToken(tokenPayload, {
      now,
      secret: 'test-secret',
    });

    expect(
      verifySimulatedOrderToken(token, { now, secret: 'test-secret' })
    ).toMatchObject({
      claims: expect.objectContaining({
        totalAmount: 5000,
        wsId: 'workspace-1',
      }),
      ok: true,
    });
    expect(
      getSimulatedOrderResponse(token, { now, secret: 'test-secret' })
    ).toMatchObject({
      order: {
        currency: 'USD',
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer',
        publicToken: token,
        status: 'completed',
        totalAmount: 5000,
        wsId: 'workspace-1',
      },
    });
  });

  it('rejects expired signed simulated order tokens', () => {
    const token = createSimulatedOrderToken(tokenPayload, {
      now: new Date('2026-06-15T00:00:00.000Z'),
      secret: 'test-secret',
    });

    expect(
      verifySimulatedOrderToken(token, {
        now: new Date('2026-06-16T00:00:01.000Z'),
        secret: 'test-secret',
      })
    ).toMatchObject({
      error: 'expired_token',
      ok: false,
    });
  });

  it('charges category bundle selections with the cheapest selected item free', () => {
    const storefrontPayload: InventoryPublicStorefrontResponse = {
      bundles: [
        {
          availableQuantity: 9,
          categoryCandidateScope: 'all_stock',
          categoryComponents: [
            {
              bundleId: 'bundle-keychains',
              candidates: [
                {
                  availableQuantity: 5,
                  componentId: 'component-keychains',
                  listingId: 'listing-a',
                  price: 1200,
                  productId: 'product-a',
                  selectionKind: 'listing',
                  title: 'Acrylic Keychain',
                  unitId: 'unit-each',
                  unitName: 'Each',
                  variantId: null,
                  warehouseId: 'warehouse-main',
                  warehouseName: 'Main',
                },
                {
                  availableQuantity: 5,
                  componentId: 'component-keychains',
                  listingId: 'listing-b',
                  price: 900,
                  productId: 'product-b',
                  selectionKind: 'listing',
                  title: 'Metal Keychain',
                  unitId: 'unit-each',
                  unitName: 'Each',
                  variantId: null,
                  warehouseId: 'warehouse-main',
                  warehouseName: 'Main',
                },
                {
                  availableQuantity: 5,
                  componentId: 'component-keychains',
                  listingId: 'listing-c',
                  price: 1500,
                  productId: 'product-c',
                  selectionKind: 'listing',
                  title: 'Charm Keychain',
                  unitId: 'unit-each',
                  unitName: 'Each',
                  variantId: null,
                  warehouseId: 'warehouse-main',
                  warehouseName: 'Main',
                },
              ],
              categoryId: 'category-keychains',
              categoryName: 'Keychains',
              discountStrategy: 'cheapest_free',
              freeQuantity: 1,
              id: 'component-keychains',
              quantityRequired: 3,
              sortOrder: 0,
            },
          ],
          components: [],
          createdAt: '2026-07-03T00:00:00.000Z',
          description: null,
          id: 'bundle-keychains',
          imageUrl: null,
          maxPerOrder: 99,
          name: 'Buy 2 Get 1 Keychains',
          price: 0,
          pricingMode: 'selected_items',
          slug: 'buy-2-get-1-keychains',
          status: 'active',
          storefrontId: 'storefront-1',
          updatedAt: '2026-07-03T00:00:00.000Z',
          wsId: 'workspace-1',
        },
      ],
      listings: [],
      storefront: {
        accentColor: null,
        analyticsEnabled: false,
        checkoutMode: 'simulated',
        cornerStyle: 'rounded',
        coverImageUrl: null,
        createdAt: '2026-07-03T00:00:00.000Z',
        currency: 'USD',
        description: null,
        heroImageUrl: null,
        id: 'storefront-1',
        layoutStyle: 'grid',
        listingsCount: 0,
        name: 'Shop',
        sections: [],
        showInventoryBadges: true,
        slug: 'shop',
        status: 'published',
        surfaceStyle: 'soft',
        themePreset: 'catalog',
        updatedAt: '2026-07-03T00:00:00.000Z',
        visibility: 'public',
        wsId: 'workspace-1',
      },
    };

    const response = createSimulatedCheckoutResponse({
      payload: {
        lines: [
          {
            bundleId: 'bundle-keychains',
            bundleSelections: {
              'component-keychains': [
                { listingId: 'listing-a', quantity: 1 },
                { listingId: 'listing-b', quantity: 1 },
                { listingId: 'listing-c', quantity: 1 },
              ],
            },
            quantity: 1,
          },
        ],
      },
      storeSlug: 'shop',
      storefrontPayload,
    });

    expect(response.checkout.subtotalAmount).toBe(2700);
    expect(response.checkout.lines[0]).toMatchObject({
      bundleId: 'bundle-keychains',
      quantity: 1,
      subtotalAmount: 2700,
      title: 'Buy 2 Get 1 Keychains',
      unitPrice: 2700,
    });
  });
});
