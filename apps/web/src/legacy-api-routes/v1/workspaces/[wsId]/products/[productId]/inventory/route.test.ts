import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInventoryWorkspaceMock,
  createAdminClientMock,
  validateInventoryItemWorkspaceRelationsMock,
} = vi.hoisted(() => ({
  authorizeInventoryWorkspaceMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  validateInventoryItemWorkspaceRelationsMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorizeInventoryWorkspaceMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@tuturuuu/inventory-core/relation-validation', () => ({
  validateInventoryItemWorkspaceRelations:
    validateInventoryItemWorkspaceRelationsMock,
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const UNIT_ID = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';
const NEXT_UNIT_ID = '55555555-5555-4555-8555-555555555555';
const NEXT_WAREHOUSE_ID = '66666666-6666-4666-8666-666666666666';

type InventoryRow = {
  amount: number | null;
  min_amount?: number | null;
  price: number;
  product_id?: string;
  unit_id: string;
  warehouse_id: string;
};

function createInventoryAdminClient({
  existingInventory = [],
  workspaceUserId = 'workspace-user-1',
}: {
  existingInventory?: InventoryRow[];
  workspaceUserId?: string | null;
} = {}) {
  const inventoryEqCalls: Array<{
    column: string;
    operation: string;
    value: unknown;
  }> = [];
  const inventoryInsert = vi.fn(async () => ({ error: null }));
  const inventoryUpdates: unknown[] = [];
  let inventoryOperation = 'select';
  const inventoryProductsQuery = {
    delete: vi.fn(() => {
      inventoryOperation = 'delete';
      return inventoryProductsQuery;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      inventoryEqCalls.push({ column, operation: inventoryOperation, value });
      if (inventoryOperation === 'select' && column === 'product_id') {
        return Promise.resolve({ data: existingInventory, error: null });
      }
      if (
        (inventoryOperation === 'delete' || inventoryOperation === 'update') &&
        column === 'unit_id'
      ) {
        return Promise.resolve({ error: null });
      }
      return inventoryProductsQuery;
    }),
    insert: inventoryInsert,
    select: vi.fn(() => {
      inventoryOperation = 'select';
      return inventoryProductsQuery;
    }),
    update: vi.fn((payload: unknown) => {
      inventoryOperation = 'update';
      inventoryUpdates.push(payload);
      return inventoryProductsQuery;
    }),
  };
  const inventoryFrom = vi.fn((table: string) => {
    if (table === 'inventory_products') return inventoryProductsQuery;
    return inventoryProductsQuery;
  });
  const schema = vi.fn(() => ({ from: inventoryFrom }));

  const productQuery = {
    eq: vi.fn(() => productQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: PRODUCT_ID },
      error: null,
    })),
    select: vi.fn(() => productQuery),
  };
  const workspaceUserQuery = {
    eq: vi.fn(() => workspaceUserQuery),
    select: vi.fn(() => workspaceUserQuery),
    single: vi.fn(async () => ({
      data: workspaceUserId ? { virtual_user_id: workspaceUserId } : null,
      error: null,
    })),
  };
  const stockChangeQuery = {
    insert: vi.fn(async () => ({ error: null })),
  };
  const from = vi.fn((table: string) => {
    if (table === 'workspace_user_linked_users') return workspaceUserQuery;
    if (table === 'product_stock_changes') return stockChangeQuery;
    return productQuery;
  });

  return {
    client: { from, schema },
    from,
    inventoryEqCalls,
    inventoryFrom,
    inventoryInsert,
    inventoryProductsQuery,
    inventoryUpdates,
    productQuery,
    schema,
    stockChangeQuery,
    workspaceUserQuery,
  };
}

describe('product inventory route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authorizeInventoryWorkspaceMock.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: vi.fn((permission: string) =>
            ['update_stock_quantity'].includes(permission)
          ),
        },
        userId: 'user-1',
        wsId: WORKSPACE_ID,
      },
    });
  });

  it('rejects inventory rows whose unit or warehouse is outside the workspace before insert', async () => {
    const mocks = createInventoryAdminClient();
    createAdminClientMock.mockResolvedValue(mocks.client);
    validateInventoryItemWorkspaceRelationsMock.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Invalid inventory unit',
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request(
        `http://localhost/api/v1/workspaces/personal/products/${PRODUCT_ID}/inventory`,
        {
          method: 'POST',
          body: JSON.stringify({
            inventory: [
              {
                unit_id: UNIT_ID,
                warehouse_id: WAREHOUSE_ID,
                amount: 1,
                min_amount: 0,
                price: 100,
                revenue_share_bps: 0,
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          productId: PRODUCT_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid inventory unit',
    });
    expect(validateInventoryItemWorkspaceRelationsMock).toHaveBeenCalledWith({
      inventory: [
        {
          unit_id: UNIT_ID,
          warehouse_id: WAREHOUSE_ID,
          amount: 1,
          min_amount: 0,
          price: 100,
          revenue_share_bps: 0,
        },
      ],
      inventoryClient: { from: mocks.inventoryFrom },
      wsId: WORKSPACE_ID,
    });
    expect(mocks.inventoryInsert).not.toHaveBeenCalled();
  });

  it('creates the first stock row for a product without inventory', async () => {
    const mocks = createInventoryAdminClient();
    createAdminClientMock.mockResolvedValue(mocks.client);
    validateInventoryItemWorkspaceRelationsMock.mockResolvedValue({ ok: true });

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/personal/products/${PRODUCT_ID}/inventory`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            inventory: [
              {
                unit_id: UNIT_ID,
                warehouse_id: WAREHOUSE_ID,
                amount: 7,
                min_amount: 2,
                price: 120,
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          productId: PRODUCT_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      changes: {
        deleted: 0,
        inserted: 1,
        updated: 0,
      },
      message: 'Inventory updated successfully',
    });
    expect(mocks.inventoryInsert).toHaveBeenCalledWith([
      {
        unit_id: UNIT_ID,
        warehouse_id: WAREHOUSE_ID,
        amount: 7,
        min_amount: 2,
        price: 120,
        product_id: PRODUCT_ID,
        revenue_share_bps: 0,
      },
    ]);
    expect(mocks.stockChangeQuery.insert).toHaveBeenCalledWith([
      {
        amount: 7,
        creator_id: 'workspace-user-1',
        product_id: PRODUCT_ID,
        unit_id: UNIT_ID,
        warehouse_id: WAREHOUSE_ID,
      },
    ]);
  });

  it('replaces stock rows without splitting UUID inventory keys', async () => {
    const mocks = createInventoryAdminClient({
      existingInventory: [
        {
          product_id: PRODUCT_ID,
          unit_id: UNIT_ID,
          warehouse_id: WAREHOUSE_ID,
          amount: 5,
          min_amount: 1,
          price: 100,
        },
      ],
    });
    createAdminClientMock.mockResolvedValue(mocks.client);
    validateInventoryItemWorkspaceRelationsMock.mockResolvedValue({ ok: true });

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/personal/products/${PRODUCT_ID}/inventory`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            inventory: [
              {
                unit_id: NEXT_UNIT_ID,
                warehouse_id: NEXT_WAREHOUSE_ID,
                amount: 3,
                min_amount: 1,
                price: 150,
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          productId: PRODUCT_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      changes: {
        deleted: 1,
        inserted: 1,
        updated: 0,
      },
    });
    expect(mocks.inventoryEqCalls).toEqual(
      expect.arrayContaining([
        { column: 'product_id', operation: 'delete', value: PRODUCT_ID },
        { column: 'warehouse_id', operation: 'delete', value: WAREHOUSE_ID },
        { column: 'unit_id', operation: 'delete', value: UNIT_ID },
      ])
    );
    expect(mocks.inventoryEqCalls).not.toEqual(
      expect.arrayContaining([
        { column: 'warehouse_id', operation: 'delete', value: '44444444' },
        { column: 'unit_id', operation: 'delete', value: '4444' },
      ])
    );
  });
});
