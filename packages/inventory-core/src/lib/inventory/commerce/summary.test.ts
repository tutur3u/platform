import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import { summarizeInventorySales } from './summary';

function sale(
  source: InventorySaleSummary['source'],
  paidAmount: number,
  currency = 'USD'
): InventorySaleSummary {
  return {
    completed_at: '2026-07-18T00:00:00.000Z',
    created_at: '2026-07-18T00:00:00.000Z',
    currency,
    customer_name: null,
    id: `${source}-${paidAmount}`,
    items_count: 1,
    paid_amount: paidAmount,
    source,
    total_quantity: 1,
  };
}

describe('summarizeInventorySales', () => {
  it('combines major-unit Finance invoices with minor-unit checkouts', () => {
    expect(
      summarizeInventorySales({
        currency: 'USD',
        marginPercentage: 25,
        sales: [sale('finance_invoice', 8.19), sale('checkout_session', 819)],
      })
    ).toEqual({
      currency: 'USD',
      estimatedGrossMarginPercentage: 25,
      estimatedGrossProfit: 4.1,
      excludedCurrencyCount: 0,
      revenue: 16.38,
      salesCount: 2,
      unitsSold: 2,
    });
  });

  it('keeps zero-decimal checkout currencies in whole units', () => {
    expect(
      summarizeInventorySales({
        currency: 'VND',
        marginPercentage: 0,
        sales: [sale('checkout_session', 125_000, 'VND')],
      }).revenue
    ).toBe(125_000);
  });

  it('excludes checkout sales in another currency', () => {
    expect(
      summarizeInventorySales({
        currency: 'USD',
        marginPercentage: 0,
        sales: [sale('checkout_session', 1000, 'EUR')],
      })
    ).toMatchObject({
      excludedCurrencyCount: 1,
      revenue: 0,
      salesCount: 0,
      unitsSold: 0,
    });
  });
});
