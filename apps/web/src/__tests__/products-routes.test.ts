import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const productMaybeSingle = vi.fn();
  const productInsertSingle = vi.fn();
  const productCountSingle = vi.fn();
  const inventoryInsert = vi.fn();
  const inventorySelectEq = vi.fn();
  const inventoryDeleteEq = vi.fn();
  const inventoryDeleteWarehouseEq = vi.fn();
  const inventoryUpdateEq = vi.fn();
  const stockChangesInsert = vi.fn();

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
          select: vi.fn(() => ({
            eq: inventorySelectEq,
          })),
          delete: vi.fn(() => ({
            eq: inventoryDeleteEq,
          })),
          update: vi.fn(() => ({
            eq: inventoryUpdateEq,
          })),
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
          insert: stockChangesInsert,
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
                filter: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: productCountSingle,
                  }),
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

      if (table === 'inventory_products') {
        return {
          insert: inventoryInsert,
          select: vi.fn(() => ({
            eq: inventorySelectEq,
          })),
          delete: vi.fn(() => ({
            eq: inventoryDeleteEq,
          })),
          update: vi.fn(() => ({
            eq: inventoryUpdateEq,
          })),
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
          insert: stockChangesInsert,
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
    inventoryDeleteEq,
    inventoryDeleteWarehouseEq,
    inventorySelectEq,
    inventoryUpdateEq,
    permissions,
    productCountSingle,
    productInsertSingle,
    productMaybeSingle,
    sessionSupabase,
    stockChangesInsert,
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
    mocks.inventorySelectEq.mockResolvedValue({ data: [], error: null });
    mocks.inventoryDeleteWarehouseEq.mockResolvedValue({ error: null });
    mocks.inventoryDeleteEq.mockReturnValue({
      eq: mocks.inventoryDeleteWarehouseEq,
    });
    mocks.inventoryUpdateEq.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mocks.stockChangesInsert.mockResolvedValue({ error: null });
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

  it('updates product inventory through the admin client for protected tables', async () => {
    mocks.productMaybeSingle.mockResolvedValue({
      data: { id: 'product-1' },
      error: null,
    });
    mocks.inventorySelectEq.mockResolvedValue({
      data: [
        {
          product_id: 'product-1',
          warehouse_id: '11111111-1111-4111-8111-111111111111',
          unit_id: '22222222-2222-4222-8222-222222222222',
          amount: 3,
          min_amount: 1,
          price: 10,
        },
      ],
      error: null,
    });

    const finalUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const firstUpdateEq = vi.fn().mockReturnValue({
      eq: finalUpdateEq,
    });
    mocks.inventoryUpdateEq.mockReturnValue({
      eq: firstUpdateEq,
    });

    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/products/[productId]/inventory/route'
    );
    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/products/product-1/inventory',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inventory: [
              {
                warehouse_id: '11111111-1111-4111-8111-111111111111',
                unit_id: '22222222-2222-4222-8222-222222222222',
                amount: 5,
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
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('inventory_products');
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalledWith(
      'inventory_products'
    );
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
