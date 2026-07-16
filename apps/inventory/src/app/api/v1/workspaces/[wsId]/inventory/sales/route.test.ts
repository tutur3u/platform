import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getInventorySalesPeriod: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isInventoryRealtimeEnabled: vi.fn(),
  listInventoryCommerceSales: vi.fn(),
}));

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
});
