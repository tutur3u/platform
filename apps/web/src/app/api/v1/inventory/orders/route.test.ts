import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listCheckoutOrderHistory: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  listCheckoutOrderHistory: (
    ...args: Parameters<typeof mocks.listCheckoutOrderHistory>
  ) => mocks.listCheckoutOrderHistory(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

async function getOrders(search = '') {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/api/v1/inventory/orders${search}`));
}

describe('inventory order history route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    mocks.listCheckoutOrderHistory.mockResolvedValue({
      count: 1,
      data: [
        {
          id: 'checkout-1',
          publicToken: 'token-1',
          storefrontSlug: 'shop',
          totalAmount: 2500,
        },
      ],
    });
  });

  it('requires a storefront or inventory app session', async () => {
    const unauthorized = new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
      }
    );
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: unauthorized,
    });

    const response = await getOrders();

    expect(response).toBe(unauthorized);
    expect(mocks.listCheckoutOrderHistory).not.toHaveBeenCalled();
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: {
          targetApp: ['storefront', 'inventory'],
        },
      }
    );
  });

  it('loads completed order history for the authenticated buyer', async () => {
    const response = await getOrders('?storeSlug=shop&limit=25&offset=5');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        {
          id: 'checkout-1',
          publicToken: 'token-1',
          storefrontSlug: 'shop',
          totalAmount: 2500,
        },
      ],
    });
    expect(mocks.listCheckoutOrderHistory).toHaveBeenCalledWith({
      customerAuthUid: 'user-1',
      limit: 25,
      offset: 5,
      storeSlug: 'shop',
    });
  });

  it('rejects invalid pagination', async () => {
    const response = await getOrders('?limit=999');

    expect(response.status).toBe(400);
    expect(mocks.listCheckoutOrderHistory).not.toHaveBeenCalled();
  });
});
