import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listInventorySalesPeriods } from './sales-periods';

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['eq', 'in', 'order', 'select']) {
    query[method] = vi.fn(() => query);
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable and the test double mirrors that contract.
  query.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return query;
}

describe('listInventorySalesPeriods', () => {
  it('counts only sales that the authoritative sales list can render', async () => {
    const periods = [
      {
        created_at: '2026-07-01T00:00:00.000Z',
        description: null,
        ends_at: '2026-07-31',
        id: 'period-visible',
        name: 'Hobby Horizon July 2026',
        product_scope: 'all',
        starts_at: '2026-07-01',
        status: 'active',
        updated_at: '2026-07-01T00:00:00.000Z',
        ws_id: 'ws-exocorpse',
      },
      {
        created_at: '2026-06-01T00:00:00.000Z',
        description: null,
        ends_at: null,
        id: 'period-empty',
        name: 'Unused period',
        product_scope: 'all',
        starts_at: null,
        status: 'active',
        updated_at: '2026-06-01T00:00:00.000Z',
        ws_id: 'ws-exocorpse',
      },
    ];
    const from = vi.fn((table: string) =>
      table === 'inventory_sales_periods'
        ? chain({ data: periods, error: null })
        : chain({ data: [], error: null })
    );
    const rpc = vi.fn((_name: string, args: { p_period_id: string }) =>
      Promise.resolve({
        data: [
          {
            sale: null,
            total_count: args.p_period_id === 'period-visible' ? 3 : 0,
          },
        ],
        error: null,
      })
    );
    const sbAdmin = {
      schema: vi.fn(() => ({ from, rpc })),
    } as never;

    const result = await listInventorySalesPeriods({
      includeArchived: true,
      sbAdmin,
      wsId: 'ws-exocorpse',
    });

    expect(result.map(({ id, sale_count }) => ({ id, sale_count }))).toEqual([
      { id: 'period-visible', sale_count: 3 },
      { id: 'period-empty', sale_count: 0 },
    ]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalledWith('inventory_sales_period_assignments');
  });
});
