import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  getInventoryCatalogProducts: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) =>
    mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/product-rpc', () => ({
  getInventoryCatalogProducts: (...args: unknown[]) =>
    mocks.getInventoryCatalogProducts(...args),
}));

describe('finance invoice products route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ admin: true });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: (permission: string) =>
            permission === 'create_invoices',
        },
        wsId: 'ws-1',
      },
    });
    mocks.getInventoryCatalogProducts.mockResolvedValue({
      count: 0,
      data: [],
    });
  });

  it('loads invoice products with finance app-session authorization', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/inventory/products?pageSize=500'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      request,
      'ws-1',
      { appSessionTargets: ['finance'] }
    );
    expect(mocks.getInventoryCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({ includeStock: true, wsId: 'ws-1' })
    );
  });
});
