import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createInventoryPolarCheckout: vi.fn(),
  createInventorySquareTerminalCheckout: vi.fn(),
  assertInventorySquareReady: vi.fn(),
  getCheckoutByPublicToken: vi.fn(),
  getPublicStorefront: vi.fn(),
  insert: vi.fn(),
  isInventoryEnabled: vi.fn(),
  markCheckoutProvider: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  getCheckoutByPublicToken: (...args: unknown[]) =>
    mocks.getCheckoutByPublicToken(...args),
  markCheckoutProvider: (...args: unknown[]) =>
    mocks.markCheckoutProvider(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar', () => ({
  createInventoryPolarCheckout: (...args: unknown[]) =>
    mocks.createInventoryPolarCheckout(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  assertInventorySquareReady: (...args: unknown[]) =>
    mocks.assertInventorySquareReady(...args),
  createInventorySquareTerminalCheckout: (...args: unknown[]) =>
    mocks.createInventorySquareTerminalCheckout(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
}));

vi.mock('@tuturuuu/inventory-core/access', () => ({
  isInventoryEnabled: (...args: unknown[]) => mocks.isInventoryEnabled(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { error: vi.fn() },
}));

describe('inventory storefront checkout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schema.mockReturnValue({
      from: () => ({ insert: mocks.insert }),
      rpc: mocks.rpc,
    });
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
    mocks.getPublicStorefront.mockResolvedValue({
      listings: [],
      storefront: {
        analyticsEnabled: true,
        checkoutMode: 'polar',
        id: 'storefront-1',
        visibility: 'public',
        wsId: 'ws-1',
      },
    });
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.rpc.mockResolvedValue({
      data: { publicToken: 'public-token' },
      error: null,
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.assertInventorySquareReady.mockResolvedValue({
      readiness: { issues: [], ready: true },
    });
    mocks.markCheckoutProvider.mockResolvedValue(undefined);
    mocks.createInventorySquareTerminalCheckout.mockResolvedValue({
      checkout: {
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer',
        id: 'checkout-1',
        lines: [],
        publicToken: 'public-token',
        squareStatus: 'pending',
        squareTerminalCheckoutId: 'terminal-checkout-1',
        totalAmount: 2500,
        wsId: 'ws-1',
      },
      squareCheckout: {
        id: 'terminal-checkout-1',
        status: 'PENDING',
      },
    });
    mocks.getCheckoutByPublicToken.mockResolvedValue({
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      id: 'checkout-1',
      lines: [],
      publicToken: 'public-token',
      totalAmount: 2500,
      wsId: 'ws-1',
    });
  });

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
      new Request('http://storefront.test/api', {
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
      wsId: 'ws-1',
    });
    expect(mocks.createInventoryPolarCheckout).not.toHaveBeenCalled();
    expect(body.checkoutMode).toBe('square_terminal');
    expect(body.checkout.squareTerminalCheckoutId).toBe('terminal-checkout-1');
    expect(body.nextUrl).toBe(
      'http://storefront.test/shop/orders/public-token'
    );
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
});
