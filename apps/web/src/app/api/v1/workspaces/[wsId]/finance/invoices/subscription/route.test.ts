import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  calculateInvoiceValues: vi.fn(),
  getPermissions: vi.fn(),
  getUser: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isGroupBlockedForSubscriptionInvoices: vi.fn(),
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

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('../route', () => ({
  calculateInvoiceValues: (
    ...args: Parameters<typeof mocks.calculateInvoiceValues>
  ) => mocks.calculateInvoiceValues(...args),
}));

vi.mock('@/utils/workspace-config', () => ({
  isGroupBlockedForSubscriptionInvoices: (
    ...args: Parameters<typeof mocks.isGroupBlockedForSubscriptionInvoices>
  ) => mocks.isGroupBlockedForSubscriptionInvoices(...args),
}));

describe('subscription invoice create route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices'])
    );
    mocks.isGroupBlockedForSubscriptionInvoices.mockResolvedValue(false);
    mocks.calculateInvoiceValues.mockResolvedValue({
      subtotal: 100,
      discount_amount: 0,
      total: 100,
      values_recalculated: false,
      rounding_applied: 0,
      allowPromotions: true,
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });
  });

  it('rejects non-default wallets on create without wallet override permissions', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices'])
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: 'customer-1',
            group_ids: ['group-1'],
            selected_month: '2026-04',
            content: 'Subscription invoice',
            wallet_id: 'wallet-other',
            category_id: 'category-1',
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
        }
      ),
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

  it('allows create-only wallet override permission for new subscription invoices', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices', 'set_finance_wallets_on_create'])
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: 'customer-1',
            group_ids: ['group-1'],
            selected_month: '2026-04',
            content: 'Subscription invoice',
            wallet_id: 'wallet-other',
            category_id: 'category-1',
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
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(mocks.getUser).toHaveBeenCalled();
  });
});
