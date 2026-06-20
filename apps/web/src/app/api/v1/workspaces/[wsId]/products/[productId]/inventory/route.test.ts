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

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorizeInventoryWorkspaceMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/inventory/relation-validation', () => ({
  validateInventoryItemWorkspaceRelations:
    validateInventoryItemWorkspaceRelationsMock,
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const UNIT_ID = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE_ID = '44444444-4444-4444-8444-444444444444';

function createInventoryAdminClient() {
  const insert = vi.fn();
  const inventoryFrom = vi.fn(() => ({ insert }));
  const schema = vi.fn(() => ({ from: inventoryFrom }));

  const productQuery = {
    eq: vi.fn(() => productQuery),
    maybeSingle: vi.fn(async () => ({
      data: { id: PRODUCT_ID },
      error: null,
    })),
    select: vi.fn(() => productQuery),
  };
  const from = vi.fn(() => productQuery);

  return {
    client: { from, schema },
    from,
    insert,
    inventoryFrom,
    productQuery,
    schema,
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
        },
      ],
      inventoryClient: { from: mocks.inventoryFrom },
      wsId: WORKSPACE_ID,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
