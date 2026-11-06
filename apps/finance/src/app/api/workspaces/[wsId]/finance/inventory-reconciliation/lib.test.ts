import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReconciliationSummary,
  decodeReconciliationCursor,
  encodeReconciliationCursor,
  type SummaryRow,
} from './lib';

afterEach(() => vi.restoreAllMocks());

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    amount: 100,
    amount_minor: 10_000,
    currency: 'USD',
    entry_count: 1,
    kind: 'sale',
    provider: 'cash',
    status: 'linked',
    ...overrides,
  };
}

describe('Inventory Finance reconciliation helpers', () => {
  it('round-trips opaque cursors and rejects malformed input', () => {
    const cursor = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      occurredAt: '2026-07-29T01:00:00.000Z',
    };
    expect(
      decodeReconciliationCursor(encodeReconciliationCursor(cursor))
    ).toEqual(cursor);
    expect(decodeReconciliationCursor('invalid')).toBeNull();
  });

  it('keeps pending totals separate while calculating signed provider net sales', () => {
    const summary = buildReconciliationSummary([
      {
        amount: 100,
        amount_minor: 10_000,
        currency: 'USD',
        entry_count: 2,
        kind: 'sale',
        provider: 'polar',
        status: 'linked',
      },
      {
        amount: -25,
        amount_minor: -2500,
        currency: 'USD',
        entry_count: 1,
        kind: 'refund',
        provider: 'polar',
        status: 'pending',
      },
      {
        amount: -10,
        amount_minor: -1000,
        currency: 'USD',
        entry_count: 1,
        kind: 'chargeback_hold',
        provider: 'square_terminal',
        status: 'error',
      },
      {
        amount: 10,
        amount_minor: 1000,
        currency: 'USD',
        entry_count: 1,
        kind: 'chargeback_release',
        provider: 'square_terminal',
        status: 'linked',
      },
    ]);

    expect(summary.grossSales).toEqual([
      { amount: 100, amountMinor: 10_000, count: 2, currency: 'USD' },
    ]);
    expect(summary.refunds[0]?.amountMinor).toBe(-2500);
    expect(summary.pending).toEqual([
      { amount: -35, amountMinor: -3500, count: 2, currency: 'USD' },
    ]);
    expect(summary.netSales[0]?.amountMinor).toBe(7500);
    expect(summary.providers).toHaveLength(2);
  });

  it('includes cash sales in provider summaries without external sync semantics', () => {
    const summary = buildReconciliationSummary([
      {
        amount: 30,
        amount_minor: 3000,
        currency: 'USD',
        entry_count: 1,
        kind: 'sale',
        provider: 'cash',
        status: 'linked',
      },
    ]);

    expect(summary.grossSales).toEqual([
      { amount: 30, amountMinor: 3000, count: 1, currency: 'USD' },
    ]);
    expect(summary.providers).toEqual([
      expect.objectContaining({
        grossSales: [
          { amount: 30, amountMinor: 3000, count: 1, currency: 'USD' },
        ],
        provider: 'cash',
      }),
    ]);
  });

  it('sums integer minor units and derives major output without float drift', () => {
    const summary = buildReconciliationSummary(
      [10, 20, -30].map((amountMinor) => ({
        amount: amountMinor / 100,
        amount_minor: String(amountMinor),
        currency: 'USD',
        entry_count: '1',
        kind: 'sale',
        provider: 'cash',
        status: 'linked',
      }))
    );
    expect(summary.netSales).toEqual([
      { amount: 0, amountMinor: 0, currency: 'USD', count: 3 },
    ]);
    expect(Object.is(summary.netSales[0]?.amount, -0)).toBe(false);
  });

  it('skips malformed rows, counts them and preserves valid rows on both sides', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const malformed = [
      summaryRow({ amount_minor: null }),
      summaryRow({ amount_minor: NaN }),
      summaryRow({ amount_minor: '1.5' }),
      summaryRow({ amount_minor: '9007199254740992' }),
      summaryRow({ amount_minor: '' }),
      summaryRow({ currency: 'US' }),
      summaryRow({ currency: '123' }),
    ];
    const summary = buildReconciliationSummary([
      summaryRow(),
      ...malformed,
      summaryRow({ amount_minor: 200, amount: 2 }),
    ]);
    expect(summary.netSales).toEqual([
      { amount: 102, amountMinor: 10_200, currency: 'USD', count: 2 },
    ]);
    expect(summary.grossSales).toEqual(summary.netSales);
    expect(summary.providers[0]?.netSales).toEqual(summary.netSales);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Skipped invalid Inventory Finance reconciliation rows',
      { skippedRows: malformed.length }
    );
  });

  it('skips overflowing rows atomically across totals, categories, pending and providers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const max = Number.MAX_SAFE_INTEGER;
    const summary = buildReconciliationSummary([
      summaryRow({ amount_minor: max }),
      summaryRow({ amount_minor: -max, kind: 'refund' }),
      summaryRow({ amount_minor: 1, status: 'pending' }),
    ]);
    expect(summary.netSales).toEqual([
      { amount: 0, amountMinor: 0, currency: 'USD', count: 2 },
    ]);
    expect(summary.grossSales[0]?.amountMinor).toBe(max);
    expect(summary.refunds[0]?.amountMinor).toBe(-max);
    expect(summary.pending).toEqual([]);
    expect(summary.providers[0]?.netSales).toEqual(summary.netSales);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Skipped invalid Inventory Finance reconciliation rows',
      { skippedRows: 1 }
    );
  });

  it('preserves the database unit scale for currencies that differ from Intl', () => {
    for (const [currency, amount] of [
      ['MGA', 123],
      ['CLF', 1.23],
    ] as const) {
      const summary = buildReconciliationSummary([
        {
          amount,
          amount_minor: 123,
          currency,
          entry_count: 1,
          kind: 'sale',
          provider: 'cash',
          status: 'linked',
        },
      ]);
      expect(summary.netSales).toEqual([
        { amount, amountMinor: 123, currency, count: 1 },
      ]);
    }
  });
});
