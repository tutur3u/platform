import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const productMaybeSingle = vi.fn();
  const productInsertSingle = vi.fn();
  const productCountSingle = vi.fn();
  const inventoryInsert = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_products') {
        throw new Error(
          'workspace_products should be queried with the admin client'
        );
      }

      if (table === 'inventory_products') {
        return {
          insert: inventoryInsert,
        };
      }

      if (table === 'workspace_user_linked_users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'product_stock_changes') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_products') {
        return {
          select: vi.fn((fields: string) => {
            if (fields === 'count()') {
              return {
                eq: vi.fn().mockReturnValue({
                  single: productCountSingle,
                }),
              };
            }

            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: productMaybeSingle,
                }),
              }),
            };
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: productInsertSingle,
            }),
          }),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  const permissions = {
    containsPermission: vi.fn((permission: string) =>
      [
        'view_inventory',
        'create_inventory',
        'update_stock_quantity',
        'view_stock_quantity',
      ].includes(permission)
    ),
    withoutPermission: vi.fn(() => false),
  };

  return {
    adminSupabase,
    inventoryInsert,
    permissions,
    productCountSingle,
    productInsertSingle,
    productMaybeSingle,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(() => Promise.resolve(mocks.permissions)),
  normalizeWorkspaceId: vi.fn(() => Promise.resolve('normalized-ws')),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

describe('product routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.inventoryInsert.mockResolvedValue({ error: null });
  });

  it('loads product details from workspace_products with the admin client', async () => {
    mocks.productMaybeSingle.mockResolvedValue({
      data: {
        id: 'product-1',
        name: 'Product',
        manufacturer: null,
        description: null,
        usage: null,
        inventory_products: [],
        product_categories: { name: 'Category' },
        product_stock_changes: [],
        category_id: 'category-1',
        ws_id: 'normalized-ws',
        created_at: '2026-03-18T00:00:00.000Z',
      },
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/products/[productId]/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/products/product-1'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', productId: 'product-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('workspace_products');
  });

  it('creates products through the admin client', async () => {
    mocks.productInsertSingle.mockResolvedValue({
      data: { id: 'product-1' },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/products/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Product',
          category_id: '11111111-1111-4111-8111-111111111111',
          inventory: [],
        }),
      }),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('workspace_products');
  });

  it('validates product inventory against workspace_products with the admin client', async () => {
    mocks.productMaybeSingle.mockResolvedValue({
      data: { id: 'product-1' },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/products/[productId]/inventory/route'
    );
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/products/product-1/inventory',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inventory: [
              {
                warehouse_id: '11111111-1111-4111-8111-111111111111',
                unit_id: '22222222-2222-4222-8222-222222222222',
                amount: 3,
                min_amount: 1,
                price: 10,
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', productId: 'product-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('workspace_products');
    expect(mocks.inventoryInsert).toHaveBeenCalled();
  });

  it('counts products through the admin client after session auth', async () => {
    mocks.productCountSingle.mockResolvedValue({
      data: { count: 7 },
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/products/count/route'
    );
    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/products/count'),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBe(7);
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('workspace_products');
  });
});
