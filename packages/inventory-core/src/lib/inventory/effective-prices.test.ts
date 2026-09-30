import { describe, expect, it } from 'vitest';
import type {
  InventoryPrice,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  defaultSalesPeriod,
  isCurrentSalesPeriod,
  periodAllowsProduct,
  resolvePeriodPrices,
} from './effective-prices';
const period = {
  id: 'cofi',
  status: 'active',
  starts_at: '2026-10-03',
  ends_at: '2026-10-04',
  time_zone: 'Asia/Ho_Chi_Minh',
  product_scope: 'allowlist',
  product_ids: ['p'],
} as InventorySalesPeriod;
const first = {
  id: 'first',
  period_id: 'cofi',
  product_id: 'p',
  unit_id: 'u',
  warehouse_id: 'w',
  currency: 'VND',
  price: 60000,
  valid_from: '2026-10-02T17:00:00+00:00',
  valid_to: '2026-10-03T17:00:00+00:00',
} satisfies InventoryPrice;
const next = {
  ...first,
  id: 'next',
  price: 70000,
  valid_from: first.valid_to,
  valid_to: '2026-10-04T17:00:00+00:00',
} satisfies InventoryPrice;

describe('effective season prices', () => {
  it('uses inclusive convention dates at Vietnamese midnight', () => {
    expect(
      isCurrentSalesPeriod(period, new Date('2026-10-02T16:59:59.999Z'))
    ).toBe(false);
    expect(isCurrentSalesPeriod(period, new Date('2026-10-02T17:00:00Z'))).toBe(
      true
    );
    expect(
      isCurrentSalesPeriod(period, new Date('2026-10-04T16:59:59.999Z'))
    ).toBe(true);
    expect(isCurrentSalesPeriod(period, new Date('2026-10-04T17:00:00Z'))).toBe(
      false
    );
  });
  it('uses the period timezone across DST rather than UTC dates', () => {
    const dst = {
      ...period,
      time_zone: 'America/New_York',
      starts_at: '2026-11-01',
      ends_at: '2026-11-01',
    };
    expect(isCurrentSalesPeriod(dst, new Date('2026-11-01T03:59:59Z'))).toBe(
      false
    );
    expect(isCurrentSalesPeriod(dst, new Date('2026-11-02T04:59:59Z'))).toBe(
      true
    );
    expect(isCurrentSalesPeriod(dst, new Date('2026-11-02T05:00:00Z'))).toBe(
      false
    );
  });
  it('does not pick expired configured or ambiguous seasons', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    expect(defaultSalesPeriod([period], 'expired', now)).toBe('cofi');
    expect(
      defaultSalesPeriod([period, { ...period, id: 'other' }], null, now)
    ).toBe('choose');
    expect(
      defaultSalesPeriod([period, { ...period, id: 'other' }], 'other', now)
    ).toBe('other');
    expect(
      defaultSalesPeriod([{ ...period, status: 'archived' }], null, now)
    ).toBe('choose');
    expect(defaultSalesPeriod([], null, now)).toBe('choose');
  });
  it('honors every product scope', () => {
    expect(periodAllowsProduct(period, 'p')).toBe(true);
    expect(periodAllowsProduct(period, 'old')).toBe(false);
    expect(
      periodAllowsProduct({ ...period, product_scope: 'blocklist' }, 'p')
    ).toBe(false);
    expect(
      periodAllowsProduct({ ...period, product_scope: 'all' }, 'old')
    ).toBe(true);
  });
  it('resolves adjacent intervals deterministically and preserves as-of prices', () => {
    const current = resolvePeriodPrices(
      [next, first],
      'cofi',
      'VND',
      '2026-10-03T17:00:00.000Z'
    );
    expect(current.get('p:u:w')?.id).toBe('next');
    expect(
      resolvePeriodPrices(
        [first, next],
        'cofi',
        'VND',
        '2026-10-03T16:59:59.999Z'
      ).get('p:u:w')?.price
    ).toBe(60000);
    expect(
      resolvePeriodPrices([first, next], 'cofi', 'VND', '2026-10-04T17:00:00Z')
        .size
    ).toBe(0);
  });
  it('does not borrow another season, stock tuple or currency', () => {
    const now = '2026-10-03T12:00:00Z';
    expect(resolvePeriodPrices([first], 'old', 'VND', now).size).toBe(0);
    expect(resolvePeriodPrices([first], 'cofi', 'USD', now).size).toBe(0);
    expect(
      resolvePeriodPrices([first], 'cofi', 'VND', now).has('p:u:other')
    ).toBe(false);
    expect(resolvePeriodPrices([first], 'cofi', 'VND', 'invalid').size).toBe(0);
  });
  it('keeps zero and exact fractional prices and fails on overlaps', () => {
    expect(
      resolvePeriodPrices(
        [{ ...first, price: 0 }],
        'cofi',
        'VND',
        '2026-10-03T12:00:00Z'
      ).get('p:u:w')?.price
    ).toBe(0);
    expect(
      resolvePeriodPrices(
        [{ ...first, price: 8.1, currency: 'USD' }],
        'cofi',
        'USD',
        '2026-10-03T12:00:00Z'
      ).get('p:u:w')?.price
    ).toBe(8.1);
    expect(() =>
      resolvePeriodPrices([first, first], 'cofi', 'VND', '2026-10-03T12:00:00Z')
    ).toThrow('Overlapping');
  });
});
