import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { computeProfitSummary } from './operator-pnl';

function sale(paid: number, qty: number): InventorySaleSummary {
  return {
    completed_at: null,
    created_at: null,
    customer_name: null,
    id: `s-${paid}-${qty}`,
    items_count: 1,
    paid_amount: paid,
    total_quantity: qty,
  };
}

describe('computeProfitSummary', () => {
  it('sums actual revenue, units, and counts', () => {
    const result = computeProfitSummary([sale(100, 2), sale(50, 1)], 40);
    expect(result.revenue).toBe(150);
    expect(result.unitsSold).toBe(3);
    expect(result.salesCount).toBe(2);
  });

  it('estimates gross profit and COGS from the margin', () => {
    const result = computeProfitSummary([sale(200, 1)], 30);
    expect(result.estGrossProfit).toBe(60);
    expect(result.estCogs).toBe(140);
    expect(result.marginPercentage).toBe(30);
  });

  it('clamps the margin to 0–100 and handles missing margin', () => {
    expect(computeProfitSummary([sale(100, 1)], 150).marginPercentage).toBe(
      100
    );
    expect(computeProfitSummary([sale(100, 1)], null)).toMatchObject({
      estCogs: 100,
      estGrossProfit: 0,
      marginPercentage: 0,
    });
  });

  it('handles no sales', () => {
    expect(computeProfitSummary([], 50)).toMatchObject({
      estCogs: 0,
      estGrossProfit: 0,
      revenue: 0,
      salesCount: 0,
      unitsSold: 0,
    });
  });
});
