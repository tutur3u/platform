import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createInventoryAuditLog: vi.fn(),
  diffInventoryAuditFields: vi.fn(),
  getPermissions: vi.fn(),
  getInventoryActorContext: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  serverError: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
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

vi.mock('@/lib/inventory/audit', () => ({
  createInventoryAuditLog: (
    ...args: Parameters<typeof mocks.createInventoryAuditLog>
  ) => mocks.createInventoryAuditLog(...args),
  diffInventoryAuditFields: (
    ...args: Parameters<typeof mocks.diffInventoryAuditFields>
  ) => mocks.diffInventoryAuditFields(...args),
}));

vi.mock('@/lib/inventory/actor', () => ({
  getInventoryActorContext: (
    ...args: Parameters<typeof mocks.getInventoryActorContext>
  ) => mocks.getInventoryActorContext(...args),
}));

type MutationResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

type MutationChain = {
  eq: (column: string, value: unknown) => MutationChain;
  select: (columns: string) => {
    maybeSingle: () => Promise<MutationResult>;
  };
};

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function createMutationChain(
  result: MutationResult = { data: { id: 'row-1' }, error: null }
) {
  const eqCalls: [string, unknown][] = [];
  const selectCalls: string[] = [];
  const maybeSingle = vi.fn(async () => result);

  const chain: MutationChain = {
    eq: (column, value) => {
      eqCalls.push([column, value]);
      return chain;
    },
    select: (columns) => {
      selectCalls.push(columns);
      return { maybeSingle };
    },
  };

  return { chain, eqCalls, maybeSingle, selectCalls };
}

function createCategoryClient(result?: MutationResult) {
  const updateChain = createMutationChain(result);
  const deleteChain = createMutationChain(result);
  const update = vi.fn(() => updateChain.chain);
  const deleteMutation = vi.fn(() => deleteChain.chain);
  const from = vi.fn(() => ({
    delete: deleteMutation,
    update,
  }));

  return {
    client: { from },
    deleteChain,
    deleteMutation,
    from,
    update,
    updateChain,
  };
}

function createWarehouseAdminClient(result?: MutationResult) {
  const updateChain = createMutationChain(result);
  const deleteChain = createMutationChain(result);
  const update = vi.fn(() => updateChain.chain);
  const deleteMutation = vi.fn(() => deleteChain.chain);
  const from = vi.fn(() => ({
    delete: deleteMutation,
    update,
  }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    deleteChain,
    deleteMutation,
    from,
    schema,
    update,
    updateChain,
  };
}

type UnitResult = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { message: string } | null;
};

function createUnitQuery(
  result: UnitResult = { data: { id: 'unit-1', name: 'Box' }, error: null }
) {
  const eqCalls: [string, unknown][] = [];
  const limitCalls: number[] = [];
  const selectCalls: string[] = [];
  const maybeSingle = vi.fn(async () => result);
  const single = vi.fn(async () => result);

  const chain: any = {
    data: result.data,
    error: result.error,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return chain;
    },
    limit: (value: number) => {
      limitCalls.push(value);
      return chain;
    },
    maybeSingle,
    select: (columns: string) => {
      selectCalls.push(columns);
      return chain;
    },
    single,
  };

  return { chain, eqCalls, limitCalls, maybeSingle, selectCalls, single };
}

function createUnitAdminClient() {
  const existingUnit = {
    id: 'unit-from-workspace-b',
    name: 'Box',
    ws_id: 'workspace-a',
  };
  const updatedUnit = {
    ...existingUnit,
    name: 'Crate',
  };
  const existingQuery = createUnitQuery({
    data: existingUnit,
    error: null,
  });
  const updateQuery = createUnitQuery({
    data: updatedUnit,
    error: null,
  });
  const linkedProductsQuery = createUnitQuery({ data: [], error: null });
  const deleteQuery = createUnitQuery({ data: null, error: null });
  const update = vi.fn(() => updateQuery.chain);
  const deleteMutation = vi.fn(() => deleteQuery.chain);

  const from = vi.fn((table: string) => {
    if (table === 'inventory_units') {
      return {
        delete: deleteMutation,
        select: vi.fn(() => existingQuery.chain),
        update,
      };
    }

    if (table === 'inventory_products') {
      return {
        select: vi.fn(() => linkedProductsQuery.chain),
      };
    }

    return { select: vi.fn(() => createUnitQuery().chain) };
  });
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    deleteMutation,
    deleteQuery,
    existingQuery,
    from,
    linkedProductsQuery,
    schema,
    update,
    updateQuery,
  };
}

describe('inventory item mutation workspace scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue(
      permissionsWith(['delete_inventory', 'update_inventory'])
    );
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-a');
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['delete_inventory', 'update_inventory']),
        userId: 'user-1',
        wsId: 'workspace-a',
      },
    });
    mocks.createInventoryAuditLog.mockResolvedValue(undefined);
    mocks.diffInventoryAuditFields.mockReturnValue(['name']);
    mocks.getInventoryActorContext.mockResolvedValue({
      authUserId: 'user-1',
      workspaceUserId: 'workspace-user-1',
    });
  });

  it('binds product category updates to the normalized route workspace', async () => {
    const categoryClient = createCategoryClient();
    mocks.createClient.mockResolvedValue(categoryClient.client);
    const request = new Request('https://app.example.com/api', {
      body: JSON.stringify({ name: 'Retail', ws_id: 'workspace-b' }),
      method: 'PUT',
    });

    const { PUT } = await import('./product-categories/[categoryId]/route');
    const response = await PUT(request, {
      params: Promise.resolve({
        categoryId: 'category-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      categoryClient.client
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      wsId: 'workspace-a',
    });
    expect(categoryClient.from).toHaveBeenCalledWith('product_categories');
    expect(categoryClient.update).toHaveBeenCalledWith({ name: 'Retail' });
    expect(categoryClient.updateChain.eqCalls).toEqual([
      ['id', 'category-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(categoryClient.updateChain.selectCalls).toEqual(['id']);
  });

  it('binds product category deletes to the normalized route workspace', async () => {
    const categoryClient = createCategoryClient();
    mocks.createClient.mockResolvedValue(categoryClient.client);
    const request = new Request('https://app.example.com/api', {
      method: 'DELETE',
    });

    const { DELETE } = await import('./product-categories/[categoryId]/route');
    const response = await DELETE(request, {
      params: Promise.resolve({
        categoryId: 'category-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(categoryClient.deleteChain.eqCalls).toEqual([
      ['id', 'category-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(categoryClient.deleteChain.selectCalls).toEqual(['id']);
  });

  it('binds warehouse updates to the normalized route workspace', async () => {
    const userClient = {};
    const warehouseAdmin = createWarehouseAdminClient();
    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockResolvedValue(warehouseAdmin.client);
    const request = new Request('https://app.example.com/api', {
      body: JSON.stringify({ name: 'Main', ws_id: 'workspace-b' }),
      method: 'PUT',
    });

    const { PUT } = await import('./product-warehouses/[warehouseId]/route');
    const response = await PUT(request, {
      params: Promise.resolve({
        warehouseId: 'warehouse-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      userClient
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      wsId: 'workspace-a',
    });
    expect(warehouseAdmin.schema).toHaveBeenCalledWith('private');
    expect(warehouseAdmin.from).toHaveBeenCalledWith('inventory_warehouses');
    expect(warehouseAdmin.update).toHaveBeenCalledWith({ name: 'Main' });
    expect(warehouseAdmin.updateChain.eqCalls).toEqual([
      ['id', 'warehouse-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(warehouseAdmin.updateChain.selectCalls).toEqual(['id']);
  });

  it('binds warehouse deletes to the normalized route workspace', async () => {
    const warehouseAdmin = createWarehouseAdminClient();
    mocks.createClient.mockResolvedValue({});
    mocks.createAdminClient.mockResolvedValue(warehouseAdmin.client);
    const request = new Request('https://app.example.com/api', {
      method: 'DELETE',
    });

    const { DELETE } = await import('./product-warehouses/[warehouseId]/route');
    const response = await DELETE(request, {
      params: Promise.resolve({
        warehouseId: 'warehouse-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(warehouseAdmin.deleteChain.eqCalls).toEqual([
      ['id', 'warehouse-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(warehouseAdmin.deleteChain.selectCalls).toEqual(['id']);
  });

  it('binds unit updates to the authorized inventory workspace', async () => {
    const unitAdmin = createUnitAdminClient();
    mocks.createAdminClient.mockResolvedValue(unitAdmin.client);
    const request = new Request('https://app.example.com/api', {
      body: JSON.stringify({ name: 'Crate', ws_id: 'workspace-b' }),
      method: 'PUT',
    });

    const { PUT } = await import('./product-units/[unitId]/route');
    const response = await PUT(request, {
      params: Promise.resolve({
        unitId: 'unit-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      request,
      'personal'
    );
    expect(unitAdmin.schema).toHaveBeenCalledWith('private');
    expect(unitAdmin.existingQuery.eqCalls).toEqual([
      ['id', 'unit-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(unitAdmin.update).toHaveBeenCalledWith({ name: 'Crate' });
    expect(unitAdmin.updateQuery.eqCalls).toEqual([
      ['id', 'unit-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(unitAdmin.updateQuery.selectCalls).toEqual(['*']);
  });

  it('binds unit deletes to the authorized inventory workspace', async () => {
    const unitAdmin = createUnitAdminClient();
    mocks.createAdminClient.mockResolvedValue(unitAdmin.client);
    const request = new Request('https://app.example.com/api', {
      method: 'DELETE',
    });

    const { DELETE } = await import('./product-units/[unitId]/route');
    const response = await DELETE(request, {
      params: Promise.resolve({
        unitId: 'unit-from-workspace-b',
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(unitAdmin.existingQuery.eqCalls).toEqual([
      ['id', 'unit-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
    expect(unitAdmin.linkedProductsQuery.eqCalls).toEqual([
      ['unit_id', 'unit-from-workspace-b'],
    ]);
    expect(unitAdmin.linkedProductsQuery.limitCalls).toEqual([1]);
    expect(unitAdmin.deleteMutation).toHaveBeenCalled();
    expect(unitAdmin.deleteQuery.eqCalls).toEqual([
      ['id', 'unit-from-workspace-b'],
      ['ws_id', 'workspace-a'],
    ]);
  });
});
