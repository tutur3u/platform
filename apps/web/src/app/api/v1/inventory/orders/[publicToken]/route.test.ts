import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCheckoutByPublicToken: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@/lib/inventory/commerce/checkouts', () => ({
  getCheckoutByPublicToken: (
    ...args: Parameters<typeof mocks.getCheckoutByPublicToken>
  ) => mocks.getCheckoutByPublicToken(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
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
  });

  it('rejects forged simulated order tokens', async () => {
    const response = await getOrder('simulated-order-anything');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    expect(mocks.getCheckoutByPublicToken).not.toHaveBeenCalled();
  });

  it('returns completed order details for signed simulated order tokens', async () => {
    const { createSimulatedOrderToken } = await import(
      '@/lib/inventory/commerce/simulated-checkout'
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
  });
});
