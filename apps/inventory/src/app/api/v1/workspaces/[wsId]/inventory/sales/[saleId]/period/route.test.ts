import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdminClient: vi.fn(),
  financeMaybeSingle: vi.fn(),
  setPeriod: vi.fn(),
  ProductRuleError: class InventorySalesPeriodProductRuleError extends Error {},
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/sales-periods', () => ({
  InventorySalesPeriodProductRuleError: mocks.ProductRuleError,
  setInventorySalePeriod: (...args: unknown[]) => mocks.setPeriod(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

function financeQuery() {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: mocks.financeMaybeSingle,
    select: vi.fn(() => query),
  };
  return query;
}

describe('inventory sale period assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: {
          containsPermission: vi.fn(
            (permission: string) => permission === 'update_invoices'
          ),
        },
        userId: 'actor-1',
        wsId: 'ws-real',
      },
    });
    mocks.financeMaybeSingle.mockResolvedValue({
      data: { id: '22222222-2222-4222-8222-222222222222' },
      error: null,
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => financeQuery()),
      schema: vi.fn(),
    });
    mocks.setPeriod.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Summer 2026',
    });
  });

  it('assigns an invoice sale to a period', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      new Request('http://localhost/sale/period', {
        body: JSON.stringify({
          period_id: '11111111-1111-4111-8111-111111111111',
          source: 'finance_invoice',
        }),
        method: 'PUT',
      }),
      {
        params: Promise.resolve({
          saleId: '22222222-2222-4222-8222-222222222222',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.setPeriod).toHaveBeenCalledWith({
      actorId: 'actor-1',
      periodId: '11111111-1111-4111-8111-111111111111',
      saleId: '22222222-2222-4222-8222-222222222222',
      saleSource: 'finance_invoice',
      sbAdmin: expect.any(Object),
      wsId: 'ws-real',
    });
  });

  it('rejects a sale that does not match the period product rules', async () => {
    mocks.setPeriod.mockRejectedValueOnce(new mocks.ProductRuleError());
    const { PUT } = await import('./route');
    const response = await PUT(
      new Request('http://localhost/sale/period', {
        body: JSON.stringify({
          period_id: '11111111-1111-4111-8111-111111111111',
          source: 'finance_invoice',
        }),
        method: 'PUT',
      }),
      {
        params: Promise.resolve({
          saleId: '22222222-2222-4222-8222-222222222222',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      message: 'This sale does not match the period product rules',
    });
  });
});
