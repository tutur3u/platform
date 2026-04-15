import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  canCreateInventorySales: vi.fn(),
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
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
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

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(mocks.getUser).toHaveBeenCalled();
  });
});
