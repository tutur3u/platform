import type {
  InventoryCostProfile,
  InventoryProductSalesRow,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { buildProductPnl, computeProfitSummary } from './operator-pnl';

function sale(paid: number, qty: number): InventorySaleSummary {
  return {
    completed_at: null,
    created_at: null,
    customer_name: null,
    id: `s-${paid}-${qty}`,
    items_count: 1,
    paid_amount: paid,
    source: 'checkout_session',
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

function productSales(
  productId: string,
  productName: string,
  revenue: number,
  unitsSold: number
): InventoryProductSalesRow {
  return { productId, productName, revenue, unitsSold };
}

function profileWithCost(
  productId: string,
  totalCostPerUnit: number,
  grossMarginPercentage = 50
): InventoryCostProfile {
  return {
    categoryId: null,
    categoryName: null,
    createdAt: null,
    currency: 'USD',
    id: `prof-${productId}`,
    name: 'Profile',
    notes: null,
    productId,
    productName: null,
    profitShares: [],
    scenarios: [
      {
        artCommissionCost: 0,
        batchSize: 30,
        createdAt: null,
        id: 's1',
        manufacturingCostPerUnit: 0,
        metrics: {
          batchCost: 0,
          breakEvenQuantity: null,
          grossMarginPercentage,
          grossProfitPerUnit: 0,
          totalCostPerUnit,
        },
        name: 'bulk',
        otherCostPerUnit: 0,
        packagingCostPerUnit: 0,
        profileId: `prof-${productId}`,
        shippingCost: 0,
        sortOrder: 0,
        tariffCost: 0,
        updatedAt: null,
        wsId: 'ws1',
      },
    ],
    status: 'active',
    targetRetailPrice: 100,
    updatedAt: null,
    wsId: 'ws1',
  };
}

describe('buildProductPnl', () => {
  it('computes COGS, profit, and margin from matched costing', () => {
    // Revenue is in minor units ($300 -> 30000 cents); costing unitCost is in
    // major units ($40) and is converted to minor units before subtracting.
    const [row] = buildProductPnl(
      [productSales('p1', 'Mentoring', 30_000, 3)],
      [profileWithCost('p1', 40)]
    );

    expect(row).toMatchObject({
      estCogs: 12_000, // ($40 -> 4000c) * 3 units
      estProfit: 18_000, // 30000 - 12000
      marginPercentage: 60, // 18000 / 30000
      revenue: 30_000,
      unitCost: 40,
      unitsSold: 3,
    });
  });

  it('leaves cost/margin null when no costing profile matches', () => {
    const [row] = buildProductPnl(
      [productSales('p2', 'Sticker', 5000, 10)],
      [profileWithCost('p1', 40)]
    );

    expect(row).toMatchObject({
      estCogs: null,
      estProfit: null,
      marginPercentage: null,
      revenue: 5000,
    });
  });
});
