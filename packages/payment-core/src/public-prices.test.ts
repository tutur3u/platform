import { describe, expect, it } from 'vitest';
import ids from './polar-workspace-product-ids.json';
import { type PublicPriceRow, publicWorkspacePrices } from './public-prices';

const rows: PublicPriceRow[] = Object.entries(ids).map(([key, id]) => ({
  id,
  tier: key.startsWith('plus') ? 'PLUS' : 'PRO',
  archived: false,
  pricing_model: 'seat_based',
  price_per_seat: key.endsWith('month') ? 900 : 9000,
  recurring_interval: key.endsWith('month') ? 'month' : 'year',
}));
describe('public price projection', () => {
  it('returns only display prices and picks up reconciled provider changes', () => {
    expect(publicWorkspacePrices(rows)).toEqual({
      currency: 'usd',
      prices: {
        plus: { monthly: 900, annual: 9000 },
        pro: { monthly: 900, annual: 9000 },
      },
    });
    expect(
      publicWorkspacePrices(
        rows.map((row) =>
          row.id === ids['pro-month'] ? { ...row, price_per_seat: 1900 } : row
        )
      ).prices.pro.monthly
    ).toBe(1900);
  });
  it('rejects partial, duplicate, archived, mismatched or invalid catalog data', () => {
    expect(() => publicWorkspacePrices(rows.slice(1))).toThrow();
    expect(() => publicWorkspacePrices([...rows, rows[0]!])).toThrow();
    for (const patch of [
      { archived: true },
      { tier: 'FREE' },
      { recurring_interval: 'year' },
      { pricing_model: 'fixed' },
      { price_per_seat: NaN },
      { price_per_seat: 0 },
    ])
      expect(() =>
        publicWorkspacePrices(
          rows.map((row, i) => (i === 0 ? { ...row, ...patch } : row))
        )
      ).toThrow();
  });
});
