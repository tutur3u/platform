import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdminClient: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

function permissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function validationQuery(data: { id: string } | null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    select: vi.fn(() => query),
  };
  return query;
}

function createAdmin(options?: { wallet?: { id: string } | null }) {
  const queries = {
    category: validationQuery({ id: '30000000-0000-4000-8000-000000000003' }),
    period: validationQuery({ id: '20000000-0000-4000-8000-000000000002' }),
    wallet: validationQuery(
      options?.wallet === undefined
        ? { id: '10000000-0000-4000-8000-000000000001' }
        : options.wallet
    ),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'transaction_categories') return queries.category;
      if (table === 'workspace_configs') {
        return { upsert: mocks.upsert };
      }
      throw new Error(`Unexpected public table ${table}`);
    }),
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'workspace_wallets') return queries.wallet;
        if (table === 'inventory_sales_periods') return queries.period;
        throw new Error(`Unexpected private table ${table}`);
      }),
    })),
  };
}

const context = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const payload = {
  defaultFinanceCategoryId: '30000000-0000-4000-8000-000000000003',
  defaultRevenueWalletId: '10000000-0000-4000-8000-000000000001',
  defaultSalesPeriodId: '20000000-0000-4000-8000-000000000002',
};

function request(body: unknown = payload) {
  return new Request('http://localhost/inventory/sales-defaults', {
    body: JSON.stringify(body),
    method: 'PUT',
  });
}

describe('inventory sales defaults route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(['manage_inventory_setup']),
        wsId: 'workspace-1',
      },
    });
    mocks.createAdminClient.mockResolvedValue(createAdmin());
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('validates and saves app-specific sale defaults', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'inventory_default_revenue_wallet_id',
          value: payload.defaultRevenueWalletId,
          ws_id: 'workspace-1',
        }),
        expect.objectContaining({
          id: 'inventory_default_finance_category_id',
          value: payload.defaultFinanceCategoryId,
        }),
        expect.objectContaining({
          id: 'inventory_default_sales_period_id',
          value: payload.defaultSalesPeriodId,
        }),
      ]),
      { onConflict: 'ws_id,id' }
    );
  });

  it('allows clearing all defaults', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      request({
        defaultFinanceCategoryId: null,
        defaultRevenueWalletId: null,
        defaultSalesPeriodId: null,
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ value: '' })]),
      { onConflict: 'ws_id,id' }
    );
  });

  it('rejects cross-workspace wallet ids', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdmin({ wallet: null }));
    const { PUT } = await import('./route');
    const response = await PUT(request(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid revenue wallet',
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('requires a sales-management permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: { permissions: permissions([]), wsId: 'workspace-1' },
    });
    const { PUT } = await import('./route');
    const response = await PUT(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('leaves a saved auto-default untouched when the field is omitted', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(request(), context);
    const rows = mocks.upsert.mock.calls[0]?.[0] as Array<{ id: string }>;

    expect(response.status).toBe(200);
    expect(rows.map((row) => row.id)).toEqual([
      'inventory_default_finance_category_id',
      'inventory_default_revenue_wallet_id',
      'inventory_default_sales_period_id',
    ]);
  });

  it('persists an explicit auto-default without rewriting the other defaults', async () => {
    const admin = createAdmin();
    mocks.createAdminClient.mockResolvedValue(admin);
    const { PUT } = await import('./route');
    const response = await PUT(
      request({ autoSetNewSalesPeriodAsDefault: false }),
      context
    );

    expect(response.status).toBe(200);
    expect(admin.schema).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'inventory_auto_set_new_sales_period_as_default',
          value: 'false',
          ws_id: 'workspace-1',
        }),
      ],
      { onConflict: 'ws_id,id' }
    );
  });

  it('stores an enabled auto-default on the authorized workspace', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      request({ autoSetNewSalesPeriodAsDefault: true }),
      { params: Promise.resolve({ wsId: 'path-alias' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'inventory_auto_set_new_sales_period_as_default',
          value: 'true',
          ws_id: 'workspace-1',
        }),
      ],
      { onConflict: 'ws_id,id' }
    );
  });

  it('rejects an empty sales-defaults body', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(request({}), context);

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not let a sales creator change the auto-default', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(['create_inventory_sales']),
        wsId: 'workspace-1',
      },
    });
    const { PUT } = await import('./route');
    const response = await PUT(
      request({ autoSetNewSalesPeriodAsDefault: true }),
      context
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(['update_invoices', 'create_inventory', 'manage_inventory_setup'])(
    'allows %s to save the auto-default',
    async (permission) => {
      mocks.authorize.mockResolvedValue({
        ok: true,
        value: {
          permissions: permissions([permission]),
          wsId: 'workspace-1',
        },
      });
      const { PUT } = await import('./route');
      const response = await PUT(
        request({ autoSetNewSalesPeriodAsDefault: true }),
        context
      );

      expect(response.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalled();
    }
  );
});
