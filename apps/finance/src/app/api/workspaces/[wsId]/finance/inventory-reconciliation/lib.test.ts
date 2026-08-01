import { describe, expect, it } from 'vitest';
import {
  buildReconciliationSummary,
  decodeReconciliationCursor,
  encodeReconciliationCursor,
} from './lib';

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
});
