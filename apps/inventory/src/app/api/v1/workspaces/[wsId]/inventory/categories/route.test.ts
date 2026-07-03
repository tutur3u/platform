import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createInventoryAuditLog: vi.fn(),
  getInventoryActorContext: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/inventory-core/actor', () => ({
  getInventoryActorContext: (
    ...args: Parameters<typeof mocks.getInventoryActorContext>
  ) => mocks.getInventoryActorContext(...args),
}));

vi.mock('@tuturuuu/inventory-core/audit', () => ({
  createInventoryAuditLog: (
    ...args: Parameters<typeof mocks.createInventoryAuditLog>
  ) => mocks.createInventoryAuditLog(...args),
  diffInventoryAuditFields: vi.fn(() => ['name']),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function createListClient(rows: Array<Record<string, unknown>>) {
  const query = {
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn().mockResolvedValue({
      count: rows.length,
      data: rows,
      error: null,
    }),
    range: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  const from = vi.fn(() => query);

  return { client: { from }, from, query };
}

function createInsertClient(row: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));

  return {
    client: { from },
    from,
    insert,
    select,
    single,
  };
}

function createDeleteClient(row: Record<string, unknown>) {
  const existingQuery = {
    eq: vi.fn(() => existingQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    select: vi.fn(() => existingQuery),
  };
  const linkedProductsQuery = {
    eq: vi.fn(() => linkedProductsQuery),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn(() => linkedProductsQuery),
  };
  const deleteQuery = {
    eq: vi.fn(() => deleteQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    select: vi.fn(() => deleteQuery),
  };
  const categoryQuery = {
    delete: vi.fn(() => deleteQuery),
    select: vi.fn(() => existingQuery),
  };
  const from = vi.fn((table: string) =>
    table === 'workspace_products' ? linkedProductsQuery : categoryQuery
  );

  return {
    categoryQuery,
    client: { from },
    deleteQuery,
    existingQuery,
    from,
    linkedProductsQuery,
  };
}

describe('inventory categories API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInventoryAuditLog.mockResolvedValue(undefined);
    mocks.getInventoryActorContext.mockResolvedValue({ userId: 'user-1' });
  });

  it('lists categories through the inventory route using the normalized workspace id', async () => {
    const listClient = createListClient([
      { id: 'category-1', name: 'Education', ws_id: 'ws-1' },
    ]);

    mocks.createAdminClient.mockResolvedValue(listClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory']),
        wsId: 'ws-1',
      },
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/categories/route'
    );
    const response = await GET(
      new Request(
        'https://app.example.com/api?response=paginated&pageSize=100'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [{ id: 'category-1', name: 'Education', ws_id: 'ws-1' }],
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(listClient.from).toHaveBeenCalledWith('product_categories');
    expect(listClient.query.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });

  it('creates categories for setup-capable users and returns the created row', async () => {
    const insertClient = createInsertClient({
      id: 'category-1',
      name: 'Education',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(insertClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_setup']),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/categories/route'
    );
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Education' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'category-1', name: 'Education', ws_id: 'ws-1' },
    });
    expect(insertClient.from).toHaveBeenCalledWith('product_categories');
    expect(insertClient.insert).toHaveBeenCalledWith({
      name: 'Education',
      ws_id: 'ws-1',
    });
  });

  it('rejects category creation without setup permissions', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([]),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/categories/route'
    );
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Education' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('deletes categories with normalized workspace predicates after usage validation', async () => {
    const deleteClient = createDeleteClient({
      id: 'category-1',
      name: 'Education',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(deleteClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['delete_inventory']),
        wsId: 'ws-1',
      },
    });

    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/categories/[categoryId]/route'
    );
    const response = await DELETE(new Request('https://app.example.com/api'), {
      params: Promise.resolve({
        categoryId: 'category-1',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(deleteClient.from).toHaveBeenCalledWith('workspace_products');
    expect(deleteClient.from).toHaveBeenCalledWith('product_categories');
    expect(deleteClient.existingQuery.eq).toHaveBeenCalledWith(
      'id',
      'category-1'
    );
    expect(deleteClient.existingQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(deleteClient.linkedProductsQuery.eq).toHaveBeenCalledWith(
      'ws_id',
      'ws-1'
    );
    expect(deleteClient.linkedProductsQuery.eq).toHaveBeenCalledWith(
      'category_id',
      'category-1'
    );
    expect(deleteClient.deleteQuery.eq).toHaveBeenCalledWith(
      'id',
      'category-1'
    );
    expect(deleteClient.deleteQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });
});
