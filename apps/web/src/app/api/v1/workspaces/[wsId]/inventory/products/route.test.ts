import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createInventoryProductResponse: vi.fn(),
  getInventoryCatalogProducts: vi.fn(),
  productCreateSafeParse: vi.fn(),
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

vi.mock('@/lib/inventory/product-create', () => ({
  createInventoryProductResponse: (
    ...args: Parameters<typeof mocks.createInventoryProductResponse>
  ) => mocks.createInventoryProductResponse(...args),
  InventoryProductCreateSchema: {
    safeParse: (...args: Parameters<typeof mocks.productCreateSafeParse>) =>
      mocks.productCreateSafeParse(...args),
  },
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
    mocks.createInventoryProductResponse.mockReturnValue(
      Response.json({ message: 'success' })
    );
    mocks.getInventoryCatalogProducts.mockResolvedValue({
      count: 0,
      data: [],
    });
    mocks.productCreateSafeParse.mockImplementation((data) => ({
      data,
      success: true,
    }));
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

  it('creates products through the protected inventory workspace route', async () => {
    const permissions = withPermissions(['create_inventory']);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions,
        userId: 'user-1',
        wsId: 'normalized-ws',
      },
    });
    mocks.createAdminClient.mockResolvedValue({ admin: true });

    const payload = {
      category_id: '11111111-1111-4111-8111-111111111111',
      inventory: [
        {
          amount: null,
          min_amount: 0,
          price: 0,
          unit_id: '22222222-2222-4222-8222-222222222222',
          warehouse_id: '33333333-3333-4333-8333-333333333333',
        },
      ],
      name: 'Product',
      owner_id: '44444444-4444-4444-8444-444444444444',
    };

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/personal/inventory/products',
        {
          body: JSON.stringify(payload),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal',
      {
        appSessionTargets: ['inventory'],
      }
    );
    expect(mocks.productCreateSafeParse).toHaveBeenCalledWith(payload);
    expect(mocks.createInventoryProductResponse).toHaveBeenCalledWith({
      actorAuthUserId: 'user-1',
      payload,
      permissions,
      sbAdmin: { admin: true },
      wsId: 'normalized-ws',
    });
  });
});
