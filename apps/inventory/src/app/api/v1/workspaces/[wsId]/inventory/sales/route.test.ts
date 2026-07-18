import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  connection: vi.fn(),
  createFinanceInvoice: vi.fn(),
  createAdminClient: vi.fn(),
  getInventorySalesPeriod: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isInventoryRealtimeEnabled: vi.fn(),
  listInventoryCommerceSales: vi.fn(),
  setInventorySalePeriod: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createFinanceInvoice: (...args: unknown[]) =>
    mocks.createFinanceInvoice(...args),
}));

vi.mock('@tuturuuu/internal-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/internal-api')>();
  return {
    ...actual,
    withForwardedInternalApiAuth: (...args: unknown[]) =>
      mocks.withForwardedInternalApiAuth(...args),
  };
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: mocks.connection };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: unknown[]) => mocks.getWorkspaceConfig(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) =>
    mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/realtime', () => ({
  isInventoryRealtimeEnabled: (...args: unknown[]) =>
    mocks.isInventoryRealtimeEnabled(...args),
}));

vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  getInventorySalesPeriod: (...args: unknown[]) =>
    mocks.getInventorySalesPeriod(...args),
  listInventoryCommerceSales: (...args: unknown[]) =>
    mocks.listInventoryCommerceSales(...args),
  setInventorySalePeriod: (...args: unknown[]) =>
    mocks.setInventorySalePeriod(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

async function listSales(search = '') {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/ws-alias/inventory/sales${search}`
    ),
    { params: Promise.resolve({ wsId: 'ws-alias' }) }
  );
}

describe('inventory sales route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory_sales']),
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wsId: 'ws-real',
      },
    });
    mocks.isInventoryRealtimeEnabled.mockResolvedValue(true);
    mocks.getWorkspaceConfig.mockResolvedValue('VND');
    mocks.getInventorySalesPeriod.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Summer 2026',
    });
    mocks.listInventoryCommerceSales.mockResolvedValue({
      count: 2,
      data: [
        {
          completed_at: '2026-06-04T00:00:00.000Z',
          created_at: '2026-06-04T00:00:00.000Z',
          customer_name: 'Invoice sale',
          id: '11111111-1111-4111-8111-111111111112',
          items_count: 1,
          paid_amount: 4000,
          source: 'finance_invoice',
          total_quantity: 1,
        },
        {
          completed_at: '2026-06-03T00:00:00.000Z',
          created_at: '2026-06-03T00:00:00.000Z',
          currency: 'USD',
          customer_name: 'Checkout sale',
          id: '11111111-1111-4111-8111-111111111113',
          items_count: 2,
          paid_amount: 3000,
          source: 'checkout_session',
          total_quantity: 2,
        },
      ],
    });
    mocks.createFinanceInvoice.mockResolvedValue({
      invoice_id: '11111111-1111-4111-8111-111111111114',
      message: 'Invoice created successfully',
    });
    mocks.setInventorySalePeriod.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
    mocks.withForwardedInternalApiAuth.mockReturnValue({
      defaultHeaders: { cookie: 'forwarded' },
    });
  });

  it('uses the authoritative mixed-source RPC and Finance currency', async () => {
    const response = await listSales('?limit=2&offset=1');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      count: 2,
      realtime_enabled: true,
      workspace_currency: 'VND',
    });
    expect(payload.data[0]).toMatchObject({
      currency: 'VND',
      source: 'finance_invoice',
    });
    expect(mocks.listInventoryCommerceSales).toHaveBeenCalledWith({
      limit: 2,
      offset: 1,
      periodId: undefined,
      sbAdmin: { id: 'admin' },
      unassignedOnly: false,
      wsId: 'ws-real',
    });
  });

  it('filters accurately to sales without a period', async () => {
    const response = await listSales('?unassigned=true');

    expect(response.status).toBe(200);
    expect(mocks.listInventoryCommerceSales).toHaveBeenCalledWith(
      expect.objectContaining({ periodId: undefined, unassignedOnly: true })
    );
  });

  it('validates a period before requesting its sales', async () => {
    const periodId = '11111111-1111-4111-8111-111111111111';
    const response = await listSales(`?period_id=${periodId}`);

    expect(response.status).toBe(200);
    expect(mocks.getInventorySalesPeriod).toHaveBeenCalledWith({
      periodId,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
    expect(mocks.listInventoryCommerceSales).toHaveBeenCalledWith(
      expect.objectContaining({ periodId, unassignedOnly: false })
    );
  });

  it('rejects conflicting period filters', async () => {
    const periodId = '11111111-1111-4111-8111-111111111111';
    const response = await listSales(`?period_id=${periodId}&unassigned=true`);

    expect(response.status).toBe(400);
    expect(mocks.listInventoryCommerceSales).not.toHaveBeenCalled();
  });

  it('rejects users without sales permissions', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: { permissions: permissionsWith([]), wsId: 'ws-real' },
    });

    const response = await listSales();

    expect(response.status).toBe(403);
    expect(mocks.listInventoryCommerceSales).not.toHaveBeenCalled();
  });

  it('creates a sale through the canonical Finance invoice workflow', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['create_inventory_sales']),
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wsId: '22222222-2222-4222-8222-222222222222',
      },
    });
    const { POST } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-alias/inventory/sales',
      {
        body: JSON.stringify({
          category_id: '33333333-3333-4333-8333-333333333333',
          content: 'Counter sale',
          notes: 'Demo',
          period_id: '44444444-4444-4444-8444-444444444444',
          products: [
            {
              category_id: '33333333-3333-4333-8333-333333333333',
              price: 8.1,
              product_id: '55555555-5555-4555-8555-555555555555',
              quantity: 2,
              unit_id: '66666666-6666-4666-8666-666666666666',
              warehouse_id: '77777777-7777-4777-8777-777777777777',
            },
          ],
          wallet_id: '88888888-8888-4888-8888-888888888888',
        }),
        headers: { cookie: 'app-session=test' },
        method: 'POST',
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ wsId: 'ws-alias' }),
    });

    expect(response.status).toBe(201);
    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      request.headers
    );
    expect(mocks.createFinanceInvoice).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        content: 'Counter sale',
        customer_id: null,
        price_mode: 'custom',
        products: [expect.objectContaining({ price: 8.1, quantity: 2 })],
      }),
      { defaultHeaders: { cookie: 'forwarded' } }
    );
    expect(mocks.setInventorySalePeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        periodId: '44444444-4444-4444-8444-444444444444',
        saleId: '11111111-1111-4111-8111-111111111114',
        saleSource: 'finance_invoice',
      })
    );
  });

  it('rejects malformed sales before forwarding to Finance', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['create_inventory_sales']),
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wsId: 'ws-real',
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws/inventory/sales', {
        body: JSON.stringify({ products: [] }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'ws' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.createFinanceInvoice).not.toHaveBeenCalled();
  });
});
