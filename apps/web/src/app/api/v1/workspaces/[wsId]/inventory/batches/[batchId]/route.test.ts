import { beforeEach, describe, expect, it, vi } from 'vitest';

const BATCH_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT_WAREHOUSE_ID = '22222222-2222-4222-8222-222222222222';
const DESTINATION_WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';

const mocks = {
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  serverLoggerError: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
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

function createMaybeSingleQuery(row: Record<string, unknown> | null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    select: vi.fn(() => query),
  };

  return query;
}

function createRelationQuery(
  rowsById: Record<string, Record<string, unknown>>
) {
  let requestedId: string | undefined;
  const query = {
    eq: vi.fn((field: string, value: string) => {
      if (field === 'id') requestedId = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({
      data: requestedId ? (rowsById[requestedId] ?? null) : null,
      error: null,
    })),
    select: vi.fn(() => query),
  };

  return query;
}

function createPatchClient({
  currentWarehouseId,
  loadWarehouseId,
  warehouseRowsById,
}: {
  currentWarehouseId: string | null;
  loadWarehouseId: string;
  warehouseRowsById: Record<string, Record<string, unknown>>;
}) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const batchSelect = vi.fn((columns: string) => {
    if (columns === 'warehouse_id') {
      return createMaybeSingleQuery(
        currentWarehouseId ? { warehouse_id: currentWarehouseId } : null
      );
    }

    return createMaybeSingleQuery({
      created_at: '2026-06-15T00:00:00.000Z',
      id: BATCH_ID,
      price: 42,
      supplier_id: null,
      total_diff: 5,
      warehouse_id: loadWarehouseId,
    });
  });
  const batchTable = {
    select: batchSelect,
    update,
  };
  const warehouseTable = {
    select: vi.fn(() => createRelationQuery(warehouseRowsById)),
  };
  const supplierTable = {
    select: vi.fn(() => createRelationQuery({})),
  };
  const from = vi.fn((table: string) => {
    if (table === 'inventory_batches') return batchTable;
    if (table === 'inventory_warehouses') return warehouseTable;
    if (table === 'inventory_suppliers') return supplierTable;
    throw new Error(`Unexpected table: ${table}`);
  });
  const schema = vi.fn(() => ({ from }));

  return {
    batchSelect,
    client: { schema },
    from,
    schema,
    update,
    updateEq,
    warehouseTable,
  };
}

describe('inventory batch API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_setup']),
        wsId: 'ws-1',
      },
    });
  });

  it('rejects cross-workspace batch updates before mutating by id', async () => {
    const client = createPatchClient({
      currentWarehouseId: CURRENT_WAREHOUSE_ID,
      loadWarehouseId: DESTINATION_WAREHOUSE_ID,
      warehouseRowsById: {
        [DESTINATION_WAREHOUSE_ID]: {
          id: DESTINATION_WAREHOUSE_ID,
          name: 'Authorized warehouse',
          ws_id: 'ws-1',
        },
      },
    });

    mocks.createAdminClient.mockResolvedValue(client.client);

    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/batches/[batchId]/route'
    );
    const response = await PATCH(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({
          price: 42,
          warehouse_id: DESTINATION_WAREHOUSE_ID,
        }),
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({
          batchId: BATCH_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    expect(client.schema).toHaveBeenCalledWith('private');
    expect(client.batchSelect).toHaveBeenCalledWith('warehouse_id');
    expect(client.update).not.toHaveBeenCalled();
    expect(client.updateEq).not.toHaveBeenCalled();
  });

  it('updates batches after validating the current and destination warehouses', async () => {
    const client = createPatchClient({
      currentWarehouseId: CURRENT_WAREHOUSE_ID,
      loadWarehouseId: DESTINATION_WAREHOUSE_ID,
      warehouseRowsById: {
        [CURRENT_WAREHOUSE_ID]: {
          id: CURRENT_WAREHOUSE_ID,
          name: 'Current warehouse',
          ws_id: 'ws-1',
        },
        [DESTINATION_WAREHOUSE_ID]: {
          id: DESTINATION_WAREHOUSE_ID,
          name: 'Destination warehouse',
          ws_id: 'ws-1',
        },
      },
    });

    mocks.createAdminClient.mockResolvedValue(client.client);

    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/inventory/batches/[batchId]/route'
    );
    const response = await PATCH(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({
          price: 42,
          warehouse_id: DESTINATION_WAREHOUSE_ID,
        }),
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({
          batchId: BATCH_ID,
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        created_at: '2026-06-15T00:00:00.000Z',
        id: BATCH_ID,
        price: 42,
        supplier: undefined,
        supplier_id: null,
        total_diff: 5,
        warehouse: 'Destination warehouse',
        warehouse_id: DESTINATION_WAREHOUSE_ID,
        ws_id: 'ws-1',
      },
    });
    expect(client.update).toHaveBeenCalledWith({
      price: 42,
      warehouse_id: DESTINATION_WAREHOUSE_ID,
    });
    expect(client.updateEq).toHaveBeenCalledWith('id', BATCH_ID);
    expect(client.warehouseTable.select).toHaveBeenCalledTimes(3);
  });
});
