import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  getInventorySales: vi.fn(),
  isInventoryRealtimeEnabled: vi.fn(),
  listCompletedCheckoutSales: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  listCompletedCheckoutSales: (
    ...args: Parameters<typeof mocks.listCompletedCheckoutSales>
  ) => mocks.listCompletedCheckoutSales(...args),
}));

vi.mock('@tuturuuu/inventory-core/realtime', () => ({
  isInventoryRealtimeEnabled: (
    ...args: Parameters<typeof mocks.isInventoryRealtimeEnabled>
  ) => mocks.isInventoryRealtimeEnabled(...args),
}));

vi.mock('@tuturuuu/inventory-core/sales-rpc', () => ({
  getInventorySales: (...args: Parameters<typeof mocks.getInventorySales>) =>
    mocks.getInventorySales(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

async function listSales(search = '') {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/ws-alias/inventory/sales${search}`
    ),
    {
      params: Promise.resolve({ wsId: 'ws-alias' }),
    }
  );
}

describe('inventory sales route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory_sales']),
        wsId: 'ws-real',
      },
    });
    mocks.isInventoryRealtimeEnabled.mockResolvedValue(true);
    mocks.getInventorySales.mockResolvedValue({
      count: 2,
      data: [
        {
          completed_at: '2026-06-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
          customer_name: 'Invoice old',
          id: 'invoice-old',
          items_count: 1,
          paid_amount: 1000,
          total_quantity: 1,
        },
        {
          completed_at: '2026-06-04T00:00:00.000Z',
          created_at: '2026-06-04T00:00:00.000Z',
          customer_name: 'Invoice new',
          id: 'invoice-new',
          items_count: 1,
          paid_amount: 4000,
          total_quantity: 1,
        },
      ],
    });
    mocks.listCompletedCheckoutSales.mockResolvedValue({
      count: 2,
      data: [
        {
          completed_at: '2026-06-03T00:00:00.000Z',
          created_at: '2026-06-03T00:00:00.000Z',
          currency: 'USD',
          customer_name: 'Checkout one',
          id: 'checkout-one',
          items_count: 2,
          paid_amount: 3000,
          public_token: 'order-one',
          source: 'checkout_session',
          total_quantity: 2,
        },
        {
          completed_at: '2026-06-02T00:00:00.000Z',
          created_at: '2026-06-02T00:00:00.000Z',
          currency: 'USD',
          customer_name: 'Checkout two',
          id: 'checkout-two',
          items_count: 1,
          paid_amount: 2000,
          public_token: 'order-two',
          source: 'checkout_session',
          total_quantity: 1,
        },
      ],
    });
  });

  it('merges finance invoice and checkout session sales before paginating', async () => {
    const response = await listSales('?limit=2&offset=1');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 4,
      data: [
        {
          id: 'checkout-one',
          source: 'checkout_session',
        },
        {
          id: 'checkout-two',
          source: 'checkout_session',
        },
      ],
      realtime_enabled: true,
    });
    expect(mocks.getInventorySales).toHaveBeenCalledWith({
      limit: 3,
      offset: 0,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
    expect(mocks.listCompletedCheckoutSales).toHaveBeenCalledWith({
      limit: 3,
      offset: 0,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
  });

  it('marks finance rows as finance invoice sales', async () => {
    const response = await listSales('?limit=1');
    const payload = await response.json();

    expect(payload.data[0]).toMatchObject({
      id: 'invoice-new',
      source: 'finance_invoice',
    });
  });

  it('rejects users without sales permissions', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([]),
        wsId: 'ws-real',
      },
    });

    const response = await listSales();

    expect(response.status).toBe(403);
    expect(mocks.getInventorySales).not.toHaveBeenCalled();
    expect(mocks.listCompletedCheckoutSales).not.toHaveBeenCalled();
  });
});
