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
  const schema = vi.fn(() => ({ from }));

  return { client: { schema }, from, query, schema };
}

function createInsertClient(row: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    from,
    insert,
    schema,
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
  const stockQuery = {
    eq: vi.fn(() => stockQuery),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn(() => stockQuery),
  };
  const batchQuery = {
    eq: vi.fn(() => batchQuery),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn(() => batchQuery),
  };
  const deleteQuery = {
    eq: vi.fn(() => deleteQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    select: vi.fn(() => deleteQuery),
  };
  const warehouseQuery = {
    delete: vi.fn(() => deleteQuery),
    select: vi.fn(() => existingQuery),
  };
  const from = vi.fn((table: string) => {
    if (table === 'inventory_products') return stockQuery;
    if (table === 'inventory_batches') return batchQuery;
    return warehouseQuery;
  });
  const schema = vi.fn(() => ({ from }));

  return {
    batchQuery,
    client: { schema },
    deleteQuery,
    existingQuery,
    from,
    schema,
    stockQuery,
  };
}

describe('inventory warehouses API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInventoryAuditLog.mockResolvedValue(undefined);
    mocks.getInventoryActorContext.mockResolvedValue({ userId: 'user-1' });
  });

  it('lists warehouses through the inventory route using the normalized workspace id', async () => {
    const listClient = createListClient([
      { id: 'warehouse-1', name: 'Main', ws_id: 'ws-1' },
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
      '@/app/api/v1/workspaces/[wsId]/inventory/warehouses/route'
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
      data: [{ id: 'warehouse-1', name: 'Main', ws_id: 'ws-1' }],
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(listClient.schema).toHaveBeenCalledWith('private');
    expect(listClient.from).toHaveBeenCalledWith('inventory_warehouses');
    expect(listClient.query.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });

  it('creates warehouses for setup-capable users and returns the created row', async () => {
    const insertClient = createInsertClient({
      id: 'warehouse-1',
      name: 'Main',
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
      '@/app/api/v1/workspaces/[wsId]/inventory/warehouses/route'
    );
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Main' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'warehouse-1', name: 'Main', ws_id: 'ws-1' },
    });
    expect(insertClient.schema).toHaveBeenCalledWith('private');
    expect(insertClient.from).toHaveBeenCalledWith('inventory_warehouses');
    expect(insertClient.insert).toHaveBeenCalledWith({
      name: 'Main',
      ws_id: 'ws-1',
    });
  });

  it('rejects warehouse creation without setup permissions', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([]),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/warehouses/route'
    );
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Main' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('deletes warehouses with normalized workspace predicates after usage validation', async () => {
    const deleteClient = createDeleteClient({
      id: 'warehouse-1',
      name: 'Main',
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
      '@/app/api/v1/workspaces/[wsId]/inventory/warehouses/[warehouseId]/route'
    );
    const response = await DELETE(new Request('https://app.example.com/api'), {
      params: Promise.resolve({
        warehouseId: 'warehouse-1',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(deleteClient.schema).toHaveBeenCalledWith('private');
    expect(deleteClient.from).toHaveBeenCalledWith('inventory_products');
    expect(deleteClient.from).toHaveBeenCalledWith('inventory_batches');
    expect(deleteClient.from).toHaveBeenCalledWith('inventory_warehouses');
    expect(deleteClient.existingQuery.eq).toHaveBeenCalledWith(
      'id',
      'warehouse-1'
    );
    expect(deleteClient.existingQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(deleteClient.stockQuery.eq).toHaveBeenCalledWith(
      'warehouse_id',
      'warehouse-1'
    );
    expect(deleteClient.batchQuery.eq).toHaveBeenCalledWith(
      'warehouse_id',
      'warehouse-1'
    );
    expect(deleteClient.deleteQuery.eq).toHaveBeenCalledWith(
      'id',
      'warehouse-1'
    );
    expect(deleteClient.deleteQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });
});
