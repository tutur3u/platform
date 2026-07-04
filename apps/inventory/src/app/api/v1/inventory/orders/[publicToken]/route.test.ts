import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCheckoutByPublicToken: vi.fn(),
  getCheckoutStorefrontAccessByPublicToken: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  serverError: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  getCheckoutByPublicToken: (
    ...args: Parameters<typeof mocks.getCheckoutByPublicToken>
  ) => mocks.getCheckoutByPublicToken(...args),
  getCheckoutStorefrontAccessByPublicToken: (
    ...args: Parameters<typeof mocks.getCheckoutStorefrontAccessByPublicToken>
  ) => mocks.getCheckoutStorefrontAccessByPublicToken(...args),
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

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

async function getOrder(publicToken: string) {
  const { GET } = await import('./route');
  return GET(
    new Request(`http://localhost/api/v1/inventory/orders/${publicToken}`),
    {
      params: Promise.resolve({ publicToken }),
    }
  );
}

describe('public inventory order route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('INVENTORY_SIMULATED_ORDER_SECRET', 'test-secret');
    mocks.getCheckoutByPublicToken.mockResolvedValue({
      id: 'checkout-1',
      publicToken: 'public-token',
      status: 'completed',
    });
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue({
      storefrontId: 'storefront-1',
      storefrontSlug: 'shop',
      visibility: 'public',
      wsId: 'ws-1',
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects forged simulated order tokens', async () => {
    const response = await getOrder('simulated-order-anything');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    expect(mocks.getCheckoutByPublicToken).not.toHaveBeenCalled();
  });

  it('returns completed order details for signed simulated order tokens', async () => {
    const { createSimulatedOrderToken } = await import(
      '@tuturuuu/inventory-core/commerce/simulated-checkout'
    );
    const publicToken = createSimulatedOrderToken({
      currency: 'USD',
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      storeSlug: 'shop',
      subtotalAmount: 5000,
      totalAmount: 5000,
      wsId: 'workspace-1',
    });

    const response = await getOrder(publicToken);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      order: {
        customerEmail: 'buyer@example.com',
        publicToken,
        status: 'completed',
        totalAmount: 5000,
        wsId: 'workspace-1',
      },
    });
    expect(mocks.getCheckoutByPublicToken).not.toHaveBeenCalled();
  });

  it('loads persisted orders for non-simulated tokens', async () => {
    const response = await getOrder('public-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order: {
        id: 'checkout-1',
        publicToken: 'public-token',
        status: 'completed',
      },
    });
    expect(mocks.getCheckoutByPublicToken).toHaveBeenCalledWith('public-token');
    expect(mocks.getCheckoutStorefrontAccessByPublicToken).toHaveBeenCalledWith(
      'public-token'
    );
    expect(mocks.resolveSessionAuthContext).not.toHaveBeenCalled();
  });

  it('requires session auth before loading private storefront orders', async () => {
    const unauthorized = new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
      }
    );
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue({
      storefrontId: 'storefront-1',
      storefrontSlug: 'shop',
      visibility: 'private',
      wsId: 'ws-1',
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: unauthorized,
    });

    const response = await getOrder('public-token');

    expect(response.status).toBe(401);
    expect(response).toBe(unauthorized);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });

  it('rejects private storefront orders for non-members', async () => {
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue({
      storefrontId: 'storefront-1',
      storefrontSlug: 'shop',
      visibility: 'private',
      wsId: 'ws-1',
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });

    const response = await getOrder('public-token');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: {
          targetApp: ['storefront', 'inventory'],
        },
      }
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: {},
      userId: 'user-1',
      wsId: 'ws-1',
    });
  });

  it('loads private storefront orders for workspace members', async () => {
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue({
      storefrontId: 'storefront-1',
      storefrontSlug: 'shop',
      visibility: 'private',
      wsId: 'ws-1',
    });

    const response = await getOrder('public-token');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      order: {
        id: 'checkout-1',
        publicToken: 'public-token',
        status: 'completed',
      },
    });
  });

  it('returns not found when checkout storefront metadata is missing', async () => {
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue(null);

    const response = await getOrder('public-token');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    expect(mocks.resolveSessionAuthContext).not.toHaveBeenCalled();
  });
});
