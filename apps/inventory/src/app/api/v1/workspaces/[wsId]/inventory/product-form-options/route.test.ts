import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdminClient: vi.fn(),
  getOptions: vi.fn(),
  getWorkspaceConfig: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/product-rpc', () => ({
  getInventoryProductFormOptions: (...args: unknown[]) =>
    mocks.getOptions(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: unknown[]) => mocks.getWorkspaceConfig(...args),
}));

function permissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory product form options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(['create_inventory_sales']),
        wsId: 'workspace-1',
      },
    });
    const walletQuery = {
      eq: vi.fn(() => walletQuery),
      order: vi.fn(async () => ({
        data: [{ id: 'wallet-1', name: 'Counter' }],
        error: null,
      })),
      select: vi.fn(() => walletQuery),
    };
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({ from: vi.fn(() => walletQuery) })),
    });
    mocks.getOptions.mockResolvedValue({
      categories: [],
      financeCategories: [],
      manufacturers: [],
      owners: [],
      units: [],
      warehouses: [],
    });
    mocks.getWorkspaceConfig.mockImplementation(
      async (_wsId: string, id: string) =>
        ({
          default_wallet_id: 'wallet-global',
          inventory_default_finance_category_id: 'category-inventory',
          inventory_default_revenue_wallet_id: 'wallet-inventory',
          inventory_default_sales_period_id: 'period-inventory',
        })[id] ?? null
    );
  });

  it('loads app-specific sale defaults alongside catalog options', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/options'), {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      defaultFinanceCategoryId: 'category-inventory',
      defaultRevenueWalletId: 'wallet-inventory',
      defaultSalesPeriodId: 'period-inventory',
      defaultWalletId: 'wallet-global',
      wallets: [{ id: 'wallet-1', name: 'Counter' }],
    });
    expect(mocks.getWorkspaceConfig).toHaveBeenCalledTimes(4);
  });
});
