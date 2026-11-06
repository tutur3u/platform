import { beforeEach, describe, expect, it } from 'vitest';
import { mocks, resetCheckoutMocks } from './checkout-test-fixture';
import { POST } from './route';

describe('inventory storefront staff payments', () => {
  beforeEach(resetCheckoutMocks);

  it('blocks misconfigured Square storefronts before creating reservations', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.assertInventorySquareReady.mockRejectedValue(
      new Error('Square Terminal is not ready: device_missing')
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
    await expect(response.json()).resolves.toEqual({
      message: 'Square Terminal is not ready: device_missing',
    });
    expect(mocks.assertInventorySquareReady).toHaveBeenCalledWith('ws-1');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.markCheckoutProvider).not.toHaveBeenCalled();
  });

  it('dispatches Square Terminal payment and returns a local order page', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
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
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      expect.any(Object)
    );
    expect(mocks.markCheckoutProvider).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      provider: 'square_terminal',
      wsId: 'ws-1',
    });
    expect(mocks.createInventorySquareTerminalCheckout).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      deviceId: 'terminal-device-1',
      wsId: 'ws-1',
    });
    expect(mocks.createInventoryPolarCheckout).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicStorefront).toHaveBeenCalledWith('shop');
    expect(body.checkoutMode).toBe('square_terminal');
    expect(body.checkout.squareTerminalCheckoutId).toBe('terminal-checkout-1');
    expect(body.nextUrl).toBe(
      'http://storefront.tuturuuu.localhost/shop/orders/public-token'
    );
  });

  it('launches Square POS app checkout for a phone-connected Reader', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_pos',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
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
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.assertInventorySquarePosReady).toHaveBeenCalledWith('ws-1');
    expect(mocks.markCheckoutProvider).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      provider: 'square_pos',
      wsId: 'ws-1',
    });
    expect(mocks.createInventorySquarePosCheckout).toHaveBeenCalledWith({
      callbackUrl:
        'https://inventory.tuturuuu.com/api/v1/inventory/square/pos/callback',
      checkoutId: 'checkout-1',
      fallbackUrl:
        'http://storefront.tuturuuu.localhost/shop/orders/public-token',
      wsId: 'ws-1',
    });
    expect(body).toMatchObject({
      checkoutMode: 'square_pos',
      nextUrl: 'http://storefront.tuturuuu.localhost/shop/orders/public-token',
      squarePos: { androidUrl: 'intent:#Intent;end' },
    });
    expect(mocks.createInventorySquareTerminalCheckout).not.toHaveBeenCalled();
    expect(mocks.createInventoryPolarCheckout).not.toHaveBeenCalled();
  });

  it('falls back to ready same-device POS when no routed Terminal exists', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.resolveSquareCheckoutMethod.mockResolvedValue({
      checkoutMode: 'square_pos',
      fallbackApplied: true,
      terminalRouting: {
        defaultDeviceId: null,
        devices: [],
        environment: 'production',
        locationId: 'location-1',
      },
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
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
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.assertInventorySquarePosReady).toHaveBeenCalledWith('ws-1');
    expect(mocks.assertInventorySquareReady).not.toHaveBeenCalled();
    expect(mocks.resolveInventorySquareTerminalDevice).not.toHaveBeenCalled();
    expect(mocks.markCheckoutProvider).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      provider: 'square_pos',
      wsId: 'ws-1',
    });
    expect(body.checkoutMode).toBe('square_pos');
  });

  it('routes a Terminal checkout to the staff-selected paired device', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.resolveInventorySquareTerminalDevice.mockResolvedValue(
      'terminal-device-2'
    );

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
          squareDeviceId: 'terminal-device-2',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.resolveInventorySquareTerminalDevice).toHaveBeenCalledWith({
      requestedDeviceId: 'terminal-device-2',
      wsId: 'ws-1',
    });
    expect(mocks.createInventorySquareTerminalCheckout).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      deviceId: 'terminal-device-2',
      wsId: 'ws-1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      expect.objectContaining({
        p_payload: expect.not.objectContaining({
          squareDeviceId: expect.anything(),
        }),
      })
    );
  });

  it('blocks shoppers without POS staff permission before reserving stock', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({
      ok: false,
      response: Response.json(
        { code: 'POS_INITIATE_PERMISSION_REQUIRED' },
        { status: 403 }
      ),
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
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

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.assertInventorySquareReady).not.toHaveBeenCalled();
  });

  it('rejects stale or cross-location Terminal routing before reserving stock', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.resolveInventorySquareTerminalDevice.mockRejectedValue(
      new Error('That Square Terminal is not paired to this location.')
    );

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
          squareDeviceId: 'wrong-terminal',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('SQUARE_TERMINAL_ROUTE_INVALID');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects remote routing for Square POS App checkout', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_pos',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
        body: JSON.stringify({
          lines: [
            {
              listingId: '00000000-0000-4000-8000-000000000001',
              quantity: 1,
            },
          ],
          squareDeviceId: 'remote-reader',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ slug: 'shop' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('SQUARE_POS_CURRENT_DEVICE_ONLY');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('throttles repeated Square dispatches before reserving stock', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.checkRateLimit.mockResolvedValue(
      Response.json({ code: 'RATE_LIMIT_EXCEEDED' }, { status: 429 })
    );

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
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

    expect(response.status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.assertInventorySquareReady).not.toHaveBeenCalled();
  });

  it('releases Square reservations when provider marking fails', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.markCheckoutProvider.mockRejectedValue(
      new Error('checkout_provider column missing')
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
      'release_inventory_checkout_session',
      {
        p_checkout_id: 'checkout-1',
        p_ws_id: 'ws-1',
      }
    );
  });

  it('releases Square reservations when Terminal dispatch fails', async () => {
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'square_terminal',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.createInventorySquareTerminalCheckout.mockRejectedValue(
      new Error('Square Terminal is offline')
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
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe('Square Terminal is offline');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'release_inventory_checkout_session',
      {
        p_checkout_id: 'checkout-1',
        p_ws_id: 'ws-1',
      }
    );
  });

  it('completes a staff cash sale through the atomic RPC', async () => {
    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
        body: JSON.stringify({
          cash: {
            categoryId: '00000000-0000-4000-8000-000000000002',
            walletId: '00000000-0000-4000-8000-000000000003',
          },
          checkoutMethod: 'cash',
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
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.checkoutMode).toBe('cash');
    expect(body.nextUrl).toBe(
      'http://storefront.tuturuuu.localhost/shop/orders/public-token'
    );
    expect(mocks.authorizeSquareCheckoutStaff).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_inventory_checkout_session_cash_payment',
      {
        p_actor_id: 'user-1',
        p_category_id: '00000000-0000-4000-8000-000000000002',
        p_checkout_id: 'checkout-1',
        p_wallet_id: '00000000-0000-4000-8000-000000000003',
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.createInventoryPolarCheckout).not.toHaveBeenCalled();
  });

  it('denies cash checkout before inventory reservation without POS access', async () => {
    mocks.authorizeSquareCheckoutStaff.mockResolvedValue({
      ok: false,
      response: Response.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    });

    const response = await POST(
      new Request('http://storefront.tuturuuu.localhost/api', {
        body: JSON.stringify({
          cash: {
            categoryId: '00000000-0000-4000-8000-000000000002',
            walletId: '00000000-0000-4000-8000-000000000003',
          },
          checkoutMethod: 'cash',
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

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'create_inventory_checkout_session',
      expect.anything()
    );
  });
});
