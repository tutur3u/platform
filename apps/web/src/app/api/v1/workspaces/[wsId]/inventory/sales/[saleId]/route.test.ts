import { beforeEach, describe, expect, it, vi } from 'vitest';

const SALE_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_ID = '44444444-4444-4444-8444-444444444444';
const WAREHOUSE_ID = '55555555-5555-4555-8555-555555555555';
const WALLET_ID = '66666666-6666-4666-8666-666666666666';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';
const TRANSACTION_ID = '88888888-8888-4888-8888-888888888888';
const WORKSPACE_USER_ID = '99999999-9999-4999-8999-999999999999';
const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createInventoryAuditLog: vi.fn(),
  getInventoryActorContext: vi.fn(),
  getInventorySale: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@/lib/inventory/actor', () => ({
  getInventoryActorContext: (
    ...args: Parameters<typeof mocks.getInventoryActorContext>
  ) => mocks.getInventoryActorContext(...args),
}));

vi.mock('@/lib/inventory/audit', () => ({
  createInventoryAuditLog: (
    ...args: Parameters<typeof mocks.createInventoryAuditLog>
  ) => mocks.createInventoryAuditLog(...args),
  diffInventoryAuditFields: () => ['lines'],
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/sales-rpc', () => ({
  getInventorySale: (...args: Parameters<typeof mocks.getInventorySale>) =>
    mocks.getInventorySale(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function createThenableQuery<TResult>(result: TResult) {
  const query = Promise.resolve(result) as Promise<TResult> & {
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };

  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.select = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue(result);

  return query;
}

function createSaleRow({
  paidAmount = 2468,
  price = 1234,
  quantity = 2,
}: {
  paidAmount?: number;
  price?: number;
  quantity?: number;
} = {}) {
  return {
    category: null,
    category_id: CATEGORY_ID,
    completed_at: '2026-06-15T00:00:00.000Z',
    created_at: '2026-06-15T00:00:00.000Z',
    creator: null,
    creator_id: WORKSPACE_USER_ID,
    customer: null,
    customer_id: null,
    finance_invoice_products: [
      {
        amount: quantity,
        owner_id: null,
        owner_name: null,
        price,
        product_id: PRODUCT_ID,
        product_name: 'Coffee',
        product_unit: 'Bag',
        unit_id: UNIT_ID,
        warehouse: 'Main',
        warehouse_id: WAREHOUSE_ID,
      },
    ],
    id: SALE_ID,
    linked_transaction: {
      id: TRANSACTION_ID,
      taken_at: '2026-06-15T00:00:00.000Z',
    },
    note: null,
    notice: 'Sale',
    paid_amount: paidAmount,
    platform_creator: null,
    platform_creator_id: AUTH_USER_ID,
    transaction_id: TRANSACTION_ID,
    wallet: null,
    wallet_id: WALLET_ID,
  };
}

function createAdminClientMock({
  inventoryRows,
}: {
  inventoryRows: Array<{
    price: number;
    product_id: string;
    unit_id: string;
    warehouse_id: string;
  }>;
}) {
  const financeInvoiceProductDelete = vi.fn(() =>
    createThenableQuery({ error: null })
  );
  const financeInvoiceProductInsert = vi.fn(() =>
    Promise.resolve({ error: null })
  );
  const financeInvoiceUpdate = vi.fn(() =>
    createThenableQuery({ error: null })
  );
  const productStockChangesInsert = vi.fn(() =>
    Promise.resolve({ error: null })
  );
  const walletTransactionUpdate = vi.fn(() =>
    createThenableQuery({ error: null })
  );

  const publicFrom = vi.fn((table: string) => {
    if (table === 'workspace_products') {
      return createThenableQuery({
        data: [
          {
            finance_category_id: CATEGORY_ID,
            id: PRODUCT_ID,
            name: 'Coffee',
            owner_id: null,
          },
        ],
        error: null,
      });
    }

    if (table === 'transaction_categories') {
      return createThenableQuery({
        data: { id: CATEGORY_ID },
        error: null,
      });
    }

    if (table === 'product_stock_changes') {
      return {
        insert: productStockChangesInsert,
      };
    }

    if (table === 'finance_invoice_products') {
      return {
        delete: financeInvoiceProductDelete,
        insert: financeInvoiceProductInsert,
      };
    }

    if (table === 'finance_invoices') {
      return {
        update: financeInvoiceUpdate,
      };
    }

    if (table === 'wallet_transactions') {
      return {
        select: vi.fn(() =>
          createThenableQuery({
            data: {
              id: TRANSACTION_ID,
              taken_at: '2026-06-15T00:00:00.000Z',
            },
            error: null,
          })
        ),
        update: walletTransactionUpdate,
      };
    }

    throw new Error(`Unexpected public table: ${table}`);
  });

  const privateFrom = vi.fn((table: string) => {
    if (table === 'workspace_wallets') {
      return createThenableQuery({
        data: { id: WALLET_ID },
        error: null,
      });
    }

    if (table === 'inventory_units') {
      return createThenableQuery({
        data: [{ id: UNIT_ID, name: 'Bag' }],
        error: null,
      });
    }

    if (table === 'inventory_warehouses') {
      return createThenableQuery({
        data: [{ id: WAREHOUSE_ID, name: 'Main' }],
        error: null,
      });
    }

    if (table === 'inventory_products') {
      return createThenableQuery({
        data: inventoryRows,
        error: null,
      });
    }

    throw new Error(`Unexpected private table: ${table}`);
  });

  const schema = vi.fn((name: string) => {
    if (name !== 'private') {
      throw new Error(`Unexpected schema: ${name}`);
    }

    return { from: privateFrom };
  });

  return {
    client: {
      from: publicFrom,
      schema,
    },
    financeInvoiceProductInsert,
    financeInvoiceUpdate,
    productStockChangesInsert,
    walletTransactionUpdate,
  };
}

describe('inventory sale detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['update_invoices']),
        wsId: WS_ID,
      },
    });
    mocks.getInventoryActorContext.mockResolvedValue({
      authUserId: AUTH_USER_ID,
      workspaceUserId: WORKSPACE_USER_ID,
    });
    mocks.createInventoryAuditLog.mockResolvedValue(undefined);
    mocks.getInventorySale
      .mockResolvedValueOnce(createSaleRow())
      .mockResolvedValueOnce(createSaleRow());
  });

  it('uses authoritative inventory tuple prices when updating sale lines', async () => {
    const adminClient = createAdminClientMock({
      inventoryRows: [
        {
          price: 1234,
          product_id: PRODUCT_ID,
          unit_id: UNIT_ID,
          warehouse_id: WAREHOUSE_ID,
        },
      ],
    });
    mocks.createAdminClient.mockResolvedValue(adminClient.client);

    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        `https://app.example.com/api/v1/workspaces/${WS_ID}/inventory/sales/${SALE_ID}`,
        {
          body: JSON.stringify({
            products: [
              {
                price: 1,
                product_id: PRODUCT_ID,
                quantity: 2,
                unit_id: UNIT_ID,
                warehouse_id: WAREHOUSE_ID,
              },
            ],
          }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          saleId: SALE_ID,
          wsId: WS_ID,
        }),
      }
    );

    if (!response) throw new Error('Expected inventory sale update response');
    expect(response.status).toBe(200);
    expect(adminClient.financeInvoiceProductInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        amount: 2,
        price: 1234,
        product_id: PRODUCT_ID,
        unit_id: UNIT_ID,
        warehouse_id: WAREHOUSE_ID,
      }),
    ]);
    expect(adminClient.financeInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        paid_amount: 2468,
        price: 2468,
      })
    );
    expect(adminClient.walletTransactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2468,
      })
    );
    expect(adminClient.productStockChangesInsert).not.toHaveBeenCalled();
  });

  it('rejects sale lines without an exact inventory tuple before mutating', async () => {
    const adminClient = createAdminClientMock({
      inventoryRows: [],
    });
    mocks.createAdminClient.mockResolvedValue(adminClient.client);

    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        `https://app.example.com/api/v1/workspaces/${WS_ID}/inventory/sales/${SALE_ID}`,
        {
          body: JSON.stringify({
            products: [
              {
                price: 1,
                product_id: PRODUCT_ID,
                quantity: 2,
                unit_id: UNIT_ID,
                warehouse_id: WAREHOUSE_ID,
              },
            ],
          }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          saleId: SALE_ID,
          wsId: WS_ID,
        }),
      }
    );

    if (!response) throw new Error('Expected inventory sale update response');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'One or more sold product inventory records are invalid',
    });
    expect(adminClient.financeInvoiceProductInsert).not.toHaveBeenCalled();
    expect(adminClient.financeInvoiceUpdate).not.toHaveBeenCalled();
    expect(adminClient.walletTransactionUpdate).not.toHaveBeenCalled();
    expect(adminClient.productStockChangesInsert).not.toHaveBeenCalled();
  });
});
