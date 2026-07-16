import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  setInventorySalesPeriodBulk: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) =>
    mocks.authorizeInventoryWorkspace(...args),
}));
vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  InventorySalesPeriodProductRuleError: class extends Error {},
  setInventorySalesPeriodBulk: (...args: unknown[]) =>
    mocks.setInventorySalesPeriodBulk(...args),
}));

const SALE_ID = '11111111-1111-4111-8111-111111111111';
const PERIOD_ID = '22222222-2222-4222-8222-222222222222';

describe('bulk sales period route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin' });
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: vi.fn((permission: string) =>
            ['update_invoices'].includes(permission)
          ),
        },
        userId: 'actor-id',
        wsId: 'ws-real',
      },
    });
    mocks.setInventorySalesPeriodBulk.mockResolvedValue({
      id: PERIOD_ID,
      name: 'Campaign',
    });
  });

  it('updates selected mixed-source sales together', async () => {
    const { PUT } = await import('./route');
    const sales = [{ id: SALE_ID, source: 'finance_invoice' as const }];
    const response = await PUT(
      new Request('http://localhost/api/bulk-period', {
        body: JSON.stringify({ period_id: PERIOD_ID, sales }),
        method: 'PUT',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ updated: 1 });
    expect(mocks.setInventorySalesPeriodBulk).toHaveBeenCalledWith({
      actorId: 'actor-id',
      periodId: PERIOD_ID,
      sales,
      sbAdmin: { id: 'admin' },
      wsId: 'ws-real',
    });
  });
});
