import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getInventoryCommerceSummary: vi.fn(),
  getInventorySalesPeriod: vi.fn(),
  getWorkspaceConfig: vi.fn(),
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
vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  getInventoryCommerceSummary: (...args: unknown[]) =>
    mocks.getInventoryCommerceSummary(...args),
  getInventorySalesPeriod: (...args: unknown[]) =>
    mocks.getInventorySalesPeriod(...args),
}));

const permissions = {
  containsPermission: vi.fn((permission: string) =>
    ['view_inventory_sales'].includes(permission)
  ),
};

async function getSummary(search = '') {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/api/summary${search}`), {
    params: Promise.resolve({ wsId: 'personal' }),
  });
}

describe('inventory commerce summary route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: { permissions, wsId: 'ws-real' },
    });
    mocks.getWorkspaceConfig.mockResolvedValue('VND');
    mocks.getInventorySalesPeriod.mockResolvedValue({ id: 'period-id' });
    mocks.getInventoryCommerceSummary.mockResolvedValue({
      currency: 'VND',
      estimatedGrossMarginPercentage: 25,
      estimatedGrossProfit: 2500,
      excludedCurrencyCount: 1,
      revenue: 10_000,
      salesCount: 2,
      unitsSold: 4,
    });
  });

  it('returns RPC aggregates for unassigned sales', async () => {
    const response = await getSummary('?unassigned=true');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currency: 'VND',
      revenue: 10_000,
      unitsSold: 4,
    });
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getInventoryCommerceSummary).toHaveBeenCalledWith({
      currency: 'VND',
      periodId: undefined,
      sbAdmin: { id: 'admin' },
      unassignedOnly: true,
      wsId: 'ws-real',
    });
  });
});
