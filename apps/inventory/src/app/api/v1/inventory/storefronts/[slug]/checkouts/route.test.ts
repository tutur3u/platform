import { beforeEach, describe, expect, it } from 'vitest';
import { mocks, resetCheckoutMocks } from './checkout-test-fixture';
import { POST } from './route';

describe('inventory storefront checkout route', () => {
  beforeEach(resetCheckoutMocks);

  it('releases reserved inventory if Polar checkout creation fails', async () => {
    mocks.createInventoryPolarCheckout.mockRejectedValue(
      new Error('Polar unavailable')
    );

    const response = await POST(
      new Request('http://test.local/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      {
        p_payload: expect.objectContaining({
          customerAuthUid: 'user-1',
          customerName: 'Tuturuuu buyer',
        }),
        p_storefront_slug: 'shop',
      }
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'release_inventory_checkout_session',
      {
        p_checkout_id: 'checkout-1',
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.schema).toHaveBeenCalledWith('private');
  });

  it('denies private storefront checkout before reservation when unauthenticated', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: { visibility: 'private', wsId: 'ws-1' },
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(
      new Request('http://test.local/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      expect.anything()
    );
  });

  it('forwards category bundle selections to the reservation RPC', async () => {
    mocks.createInventoryPolarCheckout.mockResolvedValue({
      checkoutUrl: 'https://checkout.example.com/session',
    });

    const response = await POST(
      new Request('http://test.local/api', {
        body: JSON.stringify({
          customerEmail: 'buyer-entered@example.com',
          lines: [
            {
              bundleId: '00000000-0000-4000-8000-000000000101',
              bundleSelections: {
                '00000000-0000-4000-8000-000000000201': [
                  {
                    listingId: '00000000-0000-4000-8000-000000000301',
                    quantity: 1,
                  },
                  {
                    listingId: '00000000-0000-4000-8000-000000000302',
                    quantity: 1,
                  },
                  {
                    listingId: '00000000-0000-4000-8000-000000000303',
                    quantity: 1,
                  },
                ],
              },
              listingId: '00000000-0000-4000-8000-000000000401',
              quantity: 1,
            },
          ],
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      {
        p_payload: expect.objectContaining({
          customerAuthUid: 'user-1',
          customerEmail: 'buyer-entered@example.com',
          lines: [
            {
              bundleId: '00000000-0000-4000-8000-000000000101',
              bundleSelections: {
                '00000000-0000-4000-8000-000000000201': [
                  {
                    listingId: '00000000-0000-4000-8000-000000000301',
                    quantity: 1,
                  },
                  {
                    listingId: '00000000-0000-4000-8000-000000000302',
                    quantity: 1,
                  },
                  {
                    listingId: '00000000-0000-4000-8000-000000000303',
                    quantity: 1,
                  },
                ],
              },
              listingId: '00000000-0000-4000-8000-000000000401',
              quantity: 1,
            },
          ],
        }),
        p_storefront_slug: 'shop',
      }
    );
  });

  it('blocks disabled storefront checkout before creating reservations', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'disabled',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });

    const response = await POST(
      new Request('http://test.local/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );

    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns simulated checkout responses without Polar or reservation RPCs', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [
        {
          availableQuantity: 10,
          id: '00000000-0000-4000-8000-000000000001',
          maxPerOrder: 5,
          price: 25,
          productId: 'product-1',
          title: 'Poster',
          unitId: 'unit-1',
          warehouseId: 'warehouse-1',
        },
      ],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'simulated',
        currency: 'USD',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });

    const response = await POST(
      new Request('http://test.local/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 2,
            },
          ],
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.checkout.publicToken).toMatch(/^simulated-order-/);
    expect(body.checkout.totalAmount).toBe(50);
    expect(body.checkoutUrl).toContain('/shop/orders/simulated-order-');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createInventoryPolarCheckout).not.toHaveBeenCalled();
  });
});
