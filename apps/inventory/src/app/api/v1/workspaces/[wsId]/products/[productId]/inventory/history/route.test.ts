import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock, createAdminClientMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorizeMock,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function createClient({ product = true, rows = [] as unknown[] } = {}) {
  const productQuery = {
    eq: vi.fn(() => productQuery),
    maybeSingle: vi.fn(async () => ({
      data: product ? { id: PRODUCT_ID } : null,
      error: null,
    })),
    select: vi.fn(() => productQuery),
  };
  const historyQuery = {
    eq: vi.fn(() => historyQuery),
    order: vi.fn(() => historyQuery),
    range: vi.fn(async () => ({ data: rows, error: null })),
    select: vi.fn(() => historyQuery),
  };
  const relationQuery = (data: unknown[]) => {
    const query = {
      eq: vi.fn(() => query),
      in: vi.fn(async () => ({ data, error: null })),
      select: vi.fn(() => query),
    };
    return query;
  };
  const unitQuery = relationQuery([{ id: 'unit-1', name: 'Box' }]);
  const warehouseQuery = relationQuery([{ id: 'warehouse-1', name: 'Main' }]);
  const peopleQuery = relationQuery([]);
  return {
    from: vi.fn((table: string) => {
      if (table === 'workspace_products') return productQuery;
      if (table === 'product_stock_changes') return historyQuery;
      if (table === 'workspace_users') return peopleQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    historyQuery,
    schema: vi.fn(() => ({
      from: vi.fn((table: string) =>
        table === 'inventory_units' ? unitQuery : warehouseQuery
      ),
    })),
  };
}

describe('product stock history route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: vi.fn((permission: string) =>
            ['view_stock_quantity'].includes(permission)
          ),
        },
        wsId: 'workspace-1',
      },
    });
  });

  it('returns stable paginated movements scoped to the requested product', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      amount: index === 1 ? -2 : 1,
      beneficiary: null,
      beneficiary_id: null,
      created_at: `2026-07-10T02:00:0${index}.000Z`,
      creator_id: 'operator-1',
      id: `movement-${index}`,
      note: null,
      operator: null,
      unit: { id: 'unit-1', name: 'Box' },
      unit_id: 'unit-1',
      warehouse: { id: 'warehouse-1', name: 'Main' },
      warehouse_id: 'warehouse-1',
    }));
    const client = createClient({ rows });
    createAdminClientMock.mockResolvedValue(client);

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/history?limit=2&offset=5'),
      {
        params: Promise.resolve({ productId: PRODUCT_ID, wsId: 'personal' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        { direction: 'added', id: 'movement-0', quantity: 1 },
        { direction: 'removed', id: 'movement-1', quantity: 2 },
      ],
      pagination: { hasMore: true, limit: 2, offset: 5 },
    });
    expect(client.historyQuery.eq).toHaveBeenCalledWith(
      'product_id',
      PRODUCT_ID
    );
    expect(client.historyQuery.order).toHaveBeenNthCalledWith(1, 'created_at', {
      ascending: false,
    });
    expect(client.historyQuery.order).toHaveBeenNthCalledWith(2, 'id', {
      ascending: false,
    });
    expect(client.historyQuery.range).toHaveBeenCalledWith(5, 7);
  });

  it('requires stock-view permission', async () => {
    authorizeMock.mockResolvedValue({
      ok: true,
      value: {
        permissions: { containsPermission: vi.fn(() => false) },
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/history'), {
      params: Promise.resolve({ productId: PRODUCT_ID, wsId: 'personal' }),
    });

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('does not expose a product from another workspace', async () => {
    createAdminClientMock.mockResolvedValue(createClient({ product: false }));

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/history'), {
      params: Promise.resolve({ productId: PRODUCT_ID, wsId: 'personal' }),
    });

    expect(response.status).toBe(404);
  });
});
