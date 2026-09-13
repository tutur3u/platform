import type { Product } from '@tuturuuu/payment/polar';
import { describe, expect, it } from 'vitest';
import {
  assertCatalogDatabaseSnapshot,
  CATALOG_KEYS,
  type CatalogMapping,
  planCatalogSync,
} from './catalog-sync';

const mapping = Object.fromEntries(
  CATALOG_KEYS.map((key) => [key, key])
) as CatalogMapping;
const products = CATALOG_KEYS.map((key) => ({
  id: key,
  organizationId: 'org',
  isArchived: false,
  recurringInterval: key.split('-')[1],
  recurringIntervalCount: 1,
  metadata: { product_tier: key.split('-')[0]!.toUpperCase() },
  prices: [
    {
      id: `${key}-price`,
      amountType: 'seat_based',
      priceCurrency: 'usd',
      isArchived: false,
      seatTiers: {
        minimumSeats: 1,
        maximumSeats: null,
        tiers: [{ minSeats: 1, maxSeats: null, pricePerSeat: 800 }],
      },
    },
  ],
})) as unknown as Product[];
describe('explicit Polar catalog binding', () => {
  it('proposes all four prices in cents without mutating the snapshot', () => {
    const before = JSON.stringify(products);
    expect(
      planCatalogSync(products, mapping, 'org').map((entry) => entry.amount)
    ).toEqual([900, 9000, 1900, 19000]);
    expect(JSON.stringify(products)).toBe(before);
  });
  it('refuses wrong organization, duplicate bindings and interval changes', () => {
    expect(() => planCatalogSync(products, mapping, 'other')).toThrow(
      'organization'
    );
    expect(() =>
      planCatalogSync(products, { ...mapping, 'pro-year': 'plus-year' }, 'org')
    ).toThrow('distinct');
    expect(() =>
      planCatalogSync(
        products.map((product, i) =>
          i ? product : { ...product, recurringInterval: 'year' }
        ),
        mapping,
        'org'
      )
    ).toThrow('interval');
  });
});

it('requires a complete reconciled database binding before any provider write', () => {
  const changes = [
    {
      key: 'plus-month' as const,
      productId: 'id',
      interval: 'month' as const,
      amount: 900 as const,
      currentAmount: 800,
      currentPriceId: 'price',
      catalogVersion: '2026-09-approved' as const,
      needsUpdate: true,
    },
  ];
  const row = {
    id: 'id',
    archived: false,
    pricing_model: 'seat_based',
    recurring_interval: 'month',
    tier: 'PLUS',
    price_per_seat: 800,
  };
  expect(() => assertCatalogDatabaseSnapshot(changes, [row])).not.toThrow();
  for (const rows of [
    [],
    [row, row],
    [{ ...row, archived: true }],
    [{ ...row, price_per_seat: 700 }],
    [{ ...row, tier: 'PRO' }],
  ])
    expect(() => assertCatalogDatabaseSnapshot(changes, rows)).toThrow(
      'Database catalog mismatch'
    );
});
