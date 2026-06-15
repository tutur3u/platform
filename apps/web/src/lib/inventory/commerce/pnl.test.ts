import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { aggregateSalesByProduct, getInventorySalesByProduct } from './pnl';

describe('aggregateSalesByProduct', () => {
  it('sums revenue and units per product, sorted by revenue', () => {
    const result = aggregateSalesByProduct([
      { product_id: 'a', quantity: 2, subtotal_amount: 20 },
      { product_id: 'b', quantity: 1, subtotal_amount: 100 },
      { product_id: 'a', quantity: 3, subtotal_amount: 30 },
    ]);

    expect(result).toEqual([
      { productId: 'b', revenue: 100, unitsSold: 1 },
      { productId: 'a', revenue: 50, unitsSold: 5 },
    ]);
  });

  it('ignores lines without a product', () => {
    expect(
      aggregateSalesByProduct([
        { product_id: null, quantity: 1, subtotal_amount: 10 },
      ])
    ).toEqual([]);
  });
});

/** Awaitable query-chain stub returning a fixed terminal result. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    c[method] = vi.fn(() => c);
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable stub so the chain can be awaited like a terminal Supabase query builder.
  c.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return c;
}

describe('getInventorySalesByProduct', () => {
  it('joins product names onto aggregated sales', async () => {
    const privateFrom = vi.fn((table: string) => {
      if (table === 'inventory_checkout_sessions') {
        return chain({ data: [{ id: 's1' }, { id: 's2' }] });
      }
      return chain({
        data: [
          { product_id: 'p1', quantity: 1, subtotal_amount: 100 },
          { product_id: 'p1', quantity: 2, subtotal_amount: 50 },
        ],
      });
    });
    const publicFrom = vi.fn(() =>
      chain({ data: [{ id: 'p1', name: 'Mentoring' }] })
    );

    const sbAdmin = {
      from: publicFrom,
      schema: vi.fn(() => ({ from: privateFrom })),
    } as never;

    const rows = await getInventorySalesByProduct({ sbAdmin, wsId: 'ws-1' });

    expect(rows).toEqual([
      { productId: 'p1', productName: 'Mentoring', revenue: 150, unitsSold: 3 },
    ]);
  });

  it('returns empty when there are no completed sales', async () => {
    const sbAdmin = {
      from: vi.fn(),
      schema: vi.fn(() => ({ from: vi.fn(() => chain({ data: [] })) })),
    } as never;

    expect(await getInventorySalesByProduct({ sbAdmin, wsId: 'ws-1' })).toEqual(
      []
    );
  });
});
