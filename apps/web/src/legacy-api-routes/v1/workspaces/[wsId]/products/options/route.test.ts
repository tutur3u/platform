import { beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getInventoryCatalogProducts: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@tuturuuu/inventory-core/product-rpc', () => ({
  getInventoryCatalogProducts: (
    ...args: Parameters<typeof mocks.getInventoryCatalogProducts>
  ) => mocks.getInventoryCatalogProducts(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function productWithStock() {
  return {
    id: PRODUCT_ID,
    inventory_manufacturers: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Manufacturer',
    },
    inventory_products: [
      {
        amount: 7,
        min_amount: 2,
        price: 1200,
        unit_id: '44444444-4444-4444-8444-444444444444',
        warehouse_id: '55555555-5555-4555-8555-555555555555',
      },
    ],
    name: 'Coffee',
  };
}

describe('product options route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ admin: true });
    mocks.createClient.mockResolvedValue({ client: true });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getInventoryCatalogProducts.mockResolvedValue({
      data: [productWithStock()],
    });
  });

  it('does not expose stock quantities or prices to catalog-only users', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith(['view_inventory_catalog'])
    );

    const { GET } = await import('./route');
    const response = await GET(
      new Request(`https://app.example.com/api/v1/workspaces/${WS_ID}/options`),
      {
        params: Promise.resolve({
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getInventoryCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        includeStock: false,
        wsId: WS_ID,
      })
    );
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: PRODUCT_ID,
          inventory_products: [],
          manufacturer: 'Manufacturer',
          name: 'Coffee',
        }),
      ],
    });
  });

  it('keeps stock options for users with stock permission', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith(['view_inventory_catalog', 'view_stock_quantity'])
    );

    const { GET } = await import('./route');
    const response = await GET(
      new Request(`https://app.example.com/api/v1/workspaces/${WS_ID}/options`),
      {
        params: Promise.resolve({
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getInventoryCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        includeStock: true,
        wsId: WS_ID,
      })
    );
    await expect(response.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: PRODUCT_ID,
          inventory_products: [
            expect.objectContaining({
              amount: 7,
              min_amount: 2,
              price: 1200,
            }),
          ],
          manufacturer: 'Manufacturer',
          name: 'Coffee',
        }),
      ],
    });
  });
});
