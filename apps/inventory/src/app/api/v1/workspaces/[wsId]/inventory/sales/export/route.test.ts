import { XLSX } from '@tuturuuu/ui/xlsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getInventorySalesPeriod: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  listInventorySalesExportRows: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: mocks.connection };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) =>
    mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  getInventorySalesPeriod: (...args: unknown[]) =>
    mocks.getInventorySalesPeriod(...args),
}));

vi.mock('@tuturuuu/inventory-core/sales-export', () => ({
  listInventorySalesExportRows: (...args: unknown[]) =>
    mocks.listInventorySalesExportRows(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: unknown[]) => mocks.getWorkspaceConfig(...args),
}));

const PERIOD_ID = '11111111-1111-4111-8111-111111111111';

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

async function exportSales(search = `?period_id=${PERIOD_ID}&format=csv`) {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/ws-alias/inventory/sales/export${search}`
    ),
    { params: Promise.resolve({ wsId: 'ws-alias' }) }
  );
}

describe('inventory sales export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([
          'view_inventory_sales',
          'export_finance_data',
        ]),
        wsId: 'ws-real',
      },
    });
    mocks.getInventorySalesPeriod.mockResolvedValue({
      id: PERIOD_ID,
      name: 'Offkai 2026',
    });
    mocks.getWorkspaceConfig.mockResolvedValue('USD');
    mocks.listInventorySalesExportRows.mockResolvedValue([
      {
        category_name: 'Merch',
        checkout_provider: 'square_pos',
        completed_at: '2026-07-29T01:00:00.000Z',
        created_at: '2026-07-29T00:00:00.000Z',
        creator_name: null,
        currency: 'USD',
        customer_email: 'customer@example.test',
        customer_name: 'Customer',
        finance_invoice_id: null,
        line_id: 'line-1',
        line_total: 250,
        monetary_unit: 'minor',
        note: null,
        notice: 'Order',
        owner_id: 'owner-1',
        owner_name: 'Owner',
        period_id: PERIOD_ID,
        period_name: 'Offkai 2026',
        polar_order_id: null,
        product_id: 'product-1',
        product_name: 'Poster',
        public_token: 'token-1',
        quantity: 2,
        sale_amount: 250,
        sale_id: 'sale-1',
        sale_source: 'checkout_session',
        square_order_id: 'square-1',
        transaction_id: null,
        unit_id: 'unit-1',
        unit_name: 'Piece',
        unit_price: 125,
        wallet_name: null,
        warehouse_id: 'warehouse-1',
        warehouse_name: 'Booth',
      },
    ]);
  });

  it('preserves authentication failures', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
    });

    expect((await exportSales()).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires both sales visibility and finance export permission', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory_sales']),
        wsId: 'ws-real',
      },
    });

    expect((await exportSales()).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid formats and period identifiers', async () => {
    const response = await exportSales('?period_id=not-a-uuid&format=json');

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 404 when the period is outside the authorized workspace', async () => {
    mocks.getInventorySalesPeriod.mockResolvedValue(null);

    const response = await exportSales();

    expect(response.status).toBe(404);
    expect(mocks.listInventorySalesExportRows).not.toHaveBeenCalled();
  });

  it('returns a complete normalized CSV download', async () => {
    const response = await exportSales();
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'inventory-sales-offkai-2026.csv'
    );
    expect(csv).toContain('"Sale ID"');
    expect(csv).toContain('"2.5"');
    expect(csv).toContain('"1.25"');
    expect(mocks.listInventorySalesExportRows).toHaveBeenCalledWith({
      periodId: PERIOD_ID,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
  });

  it('returns an Excel workbook with sales and line-item sheets', async () => {
    const response = await exportSales(`?period_id=${PERIOD_ID}&format=xlsx`);
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(response.headers.get('content-disposition')).toContain(
      'inventory-sales-offkai-2026.xlsx'
    );
    expect(workbook.SheetNames).toEqual(['Sales', 'Line Items']);
  });
});
