import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createInventoryPolarCheckout: vi.fn(),
  getCheckoutByPublicToken: vi.fn(),
  getPublicStorefront: vi.fn(),
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
    mocks.schema.mockReturnValue({ rpc: mocks.rpc });
    mocks.createAdminClient.mockResolvedValue({ schema: mocks.schema });
    mocks.getPublicStorefront.mockResolvedValue({
      storefront: { visibility: 'public', wsId: 'ws-1' },
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
          customerEmail: 'buyer@example.com',
          customerName: 'Buyer',
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
        p_payload: expect.any(Object),
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
          customerEmail: 'buyer@example.com',
          customerName: 'Buyer',
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
});
