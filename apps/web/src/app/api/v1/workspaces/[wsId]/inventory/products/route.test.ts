import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  getInventoryCatalogProducts: vi.fn(),
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

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/product-rpc', () => ({
  getInventoryCatalogProducts: (
    ...args: Parameters<typeof mocks.getInventoryCatalogProducts>
  ) => mocks.getInventoryCatalogProducts(...args),
}));

describe('inventory products route', () => {
  const withPermissions = (granted: string[]) => ({
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({});
    mocks.getInventoryCatalogProducts.mockResolvedValue({
      count: 0,
      data: [],
    });
  });

  it('lets invoice creators load product stock data for invoice creation', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['create_invoices']),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/inventory/products?pageSize=500'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'ws-1',
      {
        appSessionTargets: ['inventory', 'finance'],
      }
    );
    expect(mocks.getInventoryCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        includeStock: true,
        wsId: 'ws-1',
      })
    );
  });

  it('rejects users without inventory catalog or invoice creation access', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions([]),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/inventory/products'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(mocks.getInventoryCatalogProducts).not.toHaveBeenCalled();
  });
});
