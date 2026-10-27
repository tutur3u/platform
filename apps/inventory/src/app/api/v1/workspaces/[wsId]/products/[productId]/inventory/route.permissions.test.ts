import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInventoryWorkspaceMock,
  createAdminClientMock,
  pricedEditMock,
} = vi.hoisted(() => ({
  authorizeInventoryWorkspaceMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  pricedEditMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorizeInventoryWorkspaceMock,
}));

vi.mock('@tuturuuu/inventory-core/priced-product-edit', () => ({
  editPricedProduct: pricedEditMock,
}));

vi.mock('@tuturuuu/inventory-core/commerce/public-storefront', () => ({
  safelyRevalidateWorkspaceStorefronts: vi.fn(),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function createAdminClientStub() {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { id: PRODUCT_ID }, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: { virtual_user_id: 'workspace-user-1' },
      error: null,
    })),
  };
  return {
    from: vi.fn(() => query),
    schema: vi.fn(() => ({ from: vi.fn(() => query) })),
  };
}

function grant(...granted: string[]) {
  authorizeInventoryWorkspaceMock.mockResolvedValue({
    ok: true,
    value: {
      permissions: {
        containsPermission: vi.fn((permission: string) =>
          granted.includes(permission)
        ),
      },
      userId: 'user-1',
      wsId: WORKSPACE_ID,
    },
  });
}

const context = {
  params: Promise.resolve({ productId: PRODUCT_ID, wsId: 'personal' }),
};

const request = (method: string) =>
  new Request('http://localhost/inventory', {
    method,
    body: method === 'DELETE' ? undefined : JSON.stringify({}),
  });

describe('product inventory route stock permission model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue(createAdminClientStub());
    pricedEditMock.mockResolvedValue({ deleted: 0, inserted: 0, updated: 0 });
  });

  describe.each(['POST', 'PATCH', 'DELETE'] as const)('%s', (method) => {
    const call = async () => {
      const route = await import('./route');
      return route[method](request(method), context);
    };
    // Past the gate the handler runs on its own payload rules; only the
    // permission 403 is under test here.
    const passesGate = (status: number) => expect(status).not.toBe(403);

    it('allows adjust_inventory_stock alone', async () => {
      grant('adjust_inventory_stock');
      passesGate((await call()).status);
    });

    it('still allows update_stock_quantity alone', async () => {
      grant('update_stock_quantity');
      passesGate((await call()).status);
    });

    it('returns 403 without either permission', async () => {
      grant('view_stock_quantity', 'view_inventory_stock');
      const response = await call();
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        message: 'Insufficient permissions to update stock quantities',
      });
    });
  });
});
