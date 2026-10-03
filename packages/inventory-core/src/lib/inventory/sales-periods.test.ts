import type { InventorySalesPeriod } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { preparePeriodPricingPayload } from './period-pricing';
import { listInventorySalesPeriods } from './sales-periods';

type PeriodFixture = Omit<InventorySalesPeriod, 'product_ids' | 'sale_count'>;

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['eq', 'in', 'order', 'select', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable and the test double mirrors that contract.
  query.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return query;
}

describe('listInventorySalesPeriods', () => {
  it('counts only sales that the authoritative sales list can render', async () => {
    const periods: PeriodFixture[] = [
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
    periods.push({
      ...periods[0]!,
      id: 'merged-source',
      name: 'Historical alias',
      merged_into_id: 'period-visible',
    });
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

describe('pricing migration rollout', () => {
  it('preserves legacy period writes when pricing columns are absent', async () => {
    const sb = {
      schema: () => ({ from: () => chain({ error: { code: '42703' } }) }),
    } as never;
    expect(
      await preparePeriodPricingPayload(sb, {
        name: 'Legacy',
        pricing_mode: 'legacy',
        time_zone: 'Asia/Ho_Chi_Minh',
      })
    ).toEqual({ name: 'Legacy' });
  });
  it('fails closed for scheduled writes when pricing columns are absent', async () => {
    const sb = {
      schema: () => ({ from: () => chain({ error: { code: '42703' } }) }),
    } as never;
    await expect(
      preparePeriodPricingPayload(sb, { pricing_mode: 'scheduled' })
    ).rejects.toMatchObject({ code: 'PGRST202' });
  });
});
