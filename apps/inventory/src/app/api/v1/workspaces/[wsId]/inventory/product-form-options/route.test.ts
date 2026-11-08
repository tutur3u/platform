import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdminClient: vi.fn(),
  getOptions: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  policyRead: vi.fn(),
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
  let policyEq = vi.fn();

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
    const policyQuery = {
      eq: vi.fn(() => policyQuery),
      maybeSingle: () => mocks.policyRead(),
      select: vi.fn(() => policyQuery),
    };
    policyEq = policyQuery.eq;
    mocks.policyRead.mockResolvedValue({ data: null, error: null });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'workspace_configs') throw new Error(table);
        return policyQuery;
      }),
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
      autoSetNewSalesPeriodAsDefault: false,
      canEditSalesDefaults: false,
      defaultFinanceCategoryId: 'category-inventory',
      defaultRevenueWalletId: 'wallet-inventory',
      defaultSalesPeriodId: 'period-inventory',
      defaultWalletId: 'wallet-global',
      wallets: [{ id: 'wallet-1', name: 'Counter' }],
    });
    expect(mocks.getWorkspaceConfig).toHaveBeenCalledTimes(4);
  });

  it('reads an enabled saved policy for the authorized workspace', async () => {
    mocks.policyRead.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/options'), {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoSetNewSalesPeriodAsDefault: true,
    });
    expect(policyEq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(policyEq).toHaveBeenCalledWith(
      'id',
      'inventory_auto_set_new_sales_period_as_default'
    );
  });

  it.each(['false', 'TRUE', ''])('treats stored %j as off', async (value) => {
    mocks.policyRead.mockResolvedValue({ data: { value }, error: null });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/options'), {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoSetNewSalesPeriodAsDefault: false,
    });
  });

  it('keeps the rest of the options when the policy cannot be read', async () => {
    mocks.policyRead.mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/options'), {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoSetNewSalesPeriodAsDefault: null,
      defaultSalesPeriodId: 'period-inventory',
      wallets: [{ id: 'wallet-1', name: 'Counter' }],
    });
  });

  it.each([
    ['create_inventory_sales', false],
    ['create_inventory', true],
    ['update_inventory', true],
    ['update_invoices', false],
    ['manage_inventory_setup', false],
  ] as const)(
    'reports canEditSalesDefaults for %s as %s without widening reads',
    async (permission, canEdit) => {
      mocks.authorize.mockResolvedValue({
        ok: true,
        value: {
          permissions: permissions([permission]),
          wsId: 'workspace-1',
        },
      });
      const { GET } = await import('./route');
      const response = await GET(new Request('http://localhost/options'), {
        params: Promise.resolve({ wsId: 'workspace-1' }),
      });

      if (
        permission === 'update_invoices' ||
        permission === 'manage_inventory_setup'
      ) {
        expect(response.status).toBe(403);
        return;
      }
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        canEditSalesDefaults: canEdit,
      });
    }
  );

  it('reports an unknown policy when the config read throws', async () => {
    mocks.policyRead.mockRejectedValue(new Error('config unavailable'));
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/options'), {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoSetNewSalesPeriodAsDefault: null,
      defaultSalesPeriodId: 'period-inventory',
    });
  });
});
