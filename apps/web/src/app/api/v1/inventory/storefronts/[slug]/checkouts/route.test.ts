import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createInventoryPolarCheckout: vi.fn(),
  getCheckoutByPublicToken: vi.fn(),
  getPublicStorefront: vi.fn(),
  insert: vi.fn(),
  isInventoryEnabled: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/inventory/commerce/checkouts', () => ({
  getCheckoutByPublicToken: (...args: unknown[]) =>
    mocks.getCheckoutByPublicToken(...args),
}));

vi.mock('@/lib/inventory/commerce/polar', () => ({
  createInventoryPolarCheckout: (...args: unknown[]) =>
    mocks.createInventoryPolarCheckout(...args),
}));

vi.mock('@/lib/inventory/commerce/public-storefront', () => ({
  getPublicStorefront: (...args: unknown[]) =>
    mocks.getPublicStorefront(...args),
}));

vi.mock('@/lib/inventory/access', () => ({
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
