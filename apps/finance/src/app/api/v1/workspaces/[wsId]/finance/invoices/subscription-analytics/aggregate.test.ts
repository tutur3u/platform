import { describe, expect, it } from 'vitest';
import {
  aggregateSubscriptionPayments as aggregate,
  type PaidSubscriptionInvoice,
} from './aggregate';

const wallets = new Map([
  ['vnd', 'VND'],
  ['usd', 'USD'],
]);
const query = { year: 2026, granularity: 'monthly' as const };
const invoice = (
  values: Partial<PaidSubscriptionInvoice> = {}
): PaidSubscriptionInvoice => ({
  id: 'i1',
  customer_id: 'u1',
  completed_at: '2025-12-10',
  subscription_months: ['2026-01-01'],
  valid_until: '2026-02-01',
  paid_amount: 1200,
  wallet_id: 'vnd',
  finance_invoice_user_groups: [{ user_group_id: 'g1' }],
  ...values,
});
const currency = (rows: PaidSubscriptionInvoice[]) =>
  aggregate(rows, wallets, query).currencies[0]!;
describe('tuition coverage aggregation', () => {
  it('uses tuition month instead of the payment timestamp', () => {
    const result = currency([invoice()]);
    expect(result.periods).toHaveLength(12);
    expect(result.periods[0]).toMatchObject({
      period: '2026-01',
      amount: 1200,
      paidUsers: 1,
    });
    expect(result.periods[1]?.amount).toBe(0);
  });
  it('allocates cross-year prepaid invoices only to months in the selected year', () => {
    const result = currency([
      invoice({
        subscription_months: ['2025-12-01', '2026-01-01', '2026-02-01'],
      }),
    ]);
    expect(result.summary.amount).toBe(800);
    expect(result.periods[0]?.amount).toBe(400);
    expect(result.periods[1]?.amount).toBe(400);
  });
  it('preserves unpaid gaps in explicit coverage', () => {
    const result = currency([
      invoice({ subscription_months: ['2026-01-01', '2026-03-01'] }),
    ]);
    expect(result.periods.slice(0, 3).map((p) => p.amount)).toEqual([
      600, 0, 600,
    ]);
  });
  it('counts unique user-group pairs without multiplying invoice value', () => {
    const result = currency([
      invoice({
        finance_invoice_user_groups: [
          { user_group_id: 'g1' },
          { user_group_id: 'g2' },
          { user_group_id: 'g2' },
        ],
      }),
      invoice({ id: 'i2', subscription_months: ['2026-02-01'] }),
      invoice({ id: 'i3', customer_id: 'u2' }),
    ]);
    expect(result.summary).toEqual({
      paidUsers: 2,
      paidGroups: 2,
      memberships: 3,
      invoiceCount: 3,
      amount: 3600,
    });
    expect(result.distribution).toEqual([
      { groupCount: 1, userCount: 1 },
      { groupCount: 2, userCount: 1 },
    ]);
  });
  it('deduplicates repeated invoice rows', () => {
    expect(currency([invoice(), invoice()]).summary.amount).toBe(1200);
  });
  it('keeps currencies separate and ordered', () => {
    const result = aggregate(
      [invoice(), invoice({ id: 'i2', wallet_id: 'usd', paid_amount: 50 })],
      wallets,
      query
    );
    expect(
      result.currencies.map((c) => [c.currency, c.summary.amount])
    ).toEqual([
      ['USD', 50],
      ['VND', 1200],
    ]);
  });
  it('marks unknown legacy coverage unallocated rather than using expiry as a month', () => {
    const result = aggregate(
      [invoice({ subscription_months: null })],
      wallets,
      query
    );
    expect(result).toMatchObject({ currencies: [], unallocatedInvoices: 1 });
  });
  it('counts unique users and pairs across yearly buckets, without summing monthly users', () => {
    const result = aggregate(
      [
        invoice({
          subscription_months: ['2025-12-01', '2026-01-01', '2026-02-01'],
        }),
      ],
      wallets,
      { ...query, granularity: 'yearly' }
    ).currencies[0]!;
    expect(result.periods.map((p) => p.period)).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ]);
    expect(
      result.periods
        .slice(-2)
        .map((p) => [p.amount, p.paidUsers, p.memberships])
    ).toEqual([
      [400, 1, 1],
      [800, 1, 1],
    ]);
    expect(result.summary.paidUsers).toBe(1);
    expect(result.summary.amount).toBe(1200);
  });
  it('retains value and groups for deleted customers without inventing paying users', () => {
    expect(currency([invoice({ customer_id: null })]).summary).toMatchObject({
      amount: 1200,
      paidUsers: 0,
      paidGroups: 1,
      memberships: 0,
    });
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'excludes nonpositive or nonfinite amount %s',
    (paid_amount) => {
      expect(
        aggregate([invoice({ paid_amount })], wallets, query).currencies
      ).toEqual([]);
    }
  );
  it('excludes incomplete, non-subscription and out-of-range invoices', () => {
    expect(
      aggregate(
        [
          invoice({ completed_at: null }),
          invoice({ id: 'i2', finance_invoice_user_groups: [] }),
          invoice({ id: 'i3', subscription_months: ['2027-01-01'] }),
        ],
        wallets,
        query
      ).currencies
    ).toEqual([]);
  });
  it('does not fabricate currency when a wallet cannot be resolved', () => {
    expect(() =>
      aggregate([invoice({ wallet_id: 'missing' })], wallets, query)
    ).toThrow('currency');
  });
  it.each(
    [
      [],
      ['2026-13-01'],
      ['invalid'],
      Array.from(
        { length: 13 },
        (_, i) =>
          `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
      ),
    ].map((months) => ({ months }))
  )('rejects invalid explicit months $months', ({ months }) => {
    expect(() => currency([invoice({ subscription_months: months })])).toThrow(
      'coverage'
    );
  });
  it('preserves invoice value over twelve-month allocations', () => {
    const months = Array.from(
      { length: 12 },
      (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`
    );
    const result = currency([
      invoice({ paid_amount: 100, subscription_months: months }),
    ]);
    expect(result.summary.amount).toBe(100);
    expect(result.periods.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(
      100,
      4
    );
  });
});
