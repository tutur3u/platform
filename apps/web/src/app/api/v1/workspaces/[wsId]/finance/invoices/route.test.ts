import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  canCreateInventorySales: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  getPermissions: vi.fn(),
  getUser: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isInventoryEnabled: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  sessionSupabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
};

mocks.sessionSupabase.auth.getUser = mocks.getUser;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve({})),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
  isPersonalWorkspace: vi.fn(),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@/lib/inventory/access', () => ({
  inventoryNotFoundResponse: () =>
    Response.json({ message: 'Inventory not found' }, { status: 404 }),
  isInventoryEnabled: (...args: Parameters<typeof mocks.isInventoryEnabled>) =>
    mocks.isInventoryEnabled(...args),
}));

vi.mock('@/lib/inventory/permissions', () => ({
  canCreateInventorySales: (
    ...args: Parameters<typeof mocks.canCreateInventorySales>
  ) => mocks.canCreateInventorySales(...args),
}));

describe('invoice create route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );
    mocks.isInventoryEnabled.mockResolvedValue(true);
    mocks.canCreateInventorySales.mockReturnValue(true);
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.getPermissions.mockResolvedValue(withPermissions([]));
    mocks.getFinanceRouteContext.mockImplementation(async () => ({
      context: {
        normalizedWsId: '00000000-0000-0000-0000-000000000000',
        permissions: await mocks.getPermissions(),
        sbAdmin: {},
        supabase: {},
        user: {
          email: 'agent@example.com',
          id: 'user-1',
        },
      },
    }));
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });
  });

  it('calculates invoice values through the private database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          allow_promotions: true,
          discount_amount: 10000,
          promotion_code: 'PROMO',
          promotion_description: 'Discount',
          promotion_id: 'promo-1',
          promotion_name: 'Promo',
          promotion_use_ratio: false,
          promotion_value: 10000,
          rounding_applied: 0,
          subtotal: 50000,
          total: 40000,
          values_recalculated: true,
        },
      ],
      error: null,
    });
    const schema = vi.fn(() => ({ rpc }));

    const { getCalculatedInvoiceValuesFromRpc } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/route'
    );

    const result = await getCalculatedInvoiceValuesFromRpc({
      frontendValues: {
        discount_amount: 0,
        subtotal: 50000,
        total: 50000,
      },
      isSubscriptionInvoice: false,
      products: [
        {
          category_id: 'category-1',
          price: 50000,
          product_id: 'product-1',
          quantity: 1,
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
        },
      ],
      promotionId: 'promo-1',
      supabase: { schema },
      wsId: '00000000-0000-0000-0000-000000000000',
    });

    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('calculate_invoice_values', {
      p_frontend_discount_amount: 0,
      p_frontend_subtotal: 50000,
      p_frontend_total: 50000,
      p_is_subscription_invoice: false,
      p_products: [
        {
          product_id: 'product-1',
          quantity: 1,
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
        },
      ],
      p_promotion_id: 'promo-1',
      p_ws_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(result).toEqual({
      allowPromotions: true,
      discount_amount: 10000,
      promotion: {
        code: 'PROMO',
        description: 'Discount',
        id: 'promo-1',
        name: 'Promo',
        use_ratio: false,
        value: 10000,
      },
      rounding_applied: 0,
      subtotal: 50000,
      total: 40000,
      values_recalculated: true,
    });
  });

  it('rejects non-default wallets on create without wallet override permissions', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/route'
    );

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(withPermissions([]));

    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/finance/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Invoice',
          wallet_id: 'wallet-other',
          products: [
            {
              product_id: 'product-1',
              unit_id: 'unit-1',
              warehouse_id: 'warehouse-1',
              quantity: 1,
              price: 100,
              category_id: 'category-1',
            },
          ],
        }),
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message:
        'Insufficient permissions to override the default wallet for new invoices',
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('allows create-only wallet override permission to bypass the default wallet lock on create', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/route'
    );

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['set_finance_wallets_on_create'])
    );

    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/finance/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Invoice',
          wallet_id: 'wallet-other',
          products: [
            {
              product_id: 'product-1',
              unit_id: 'unit-1',
              warehouse_id: 'warehouse-1',
              quantity: 1,
              price: 100,
              category_id: 'category-1',
            },
          ],
        }),
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Internal server error',
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
