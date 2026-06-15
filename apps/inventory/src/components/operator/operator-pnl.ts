import type {
  InventoryCostProfile,
  InventoryProductSalesRow,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import { bestMarginAcrossProfiles } from './operator-margin';

export type ProfitSummary = {
  estCogs: number;
  estGrossProfit: number;
  marginPercentage: number;
  revenue: number;
  salesCount: number;
  unitsSold: number;
};

/**
 * Combines ACTUAL sales revenue with the costing-derived average gross margin to
 * estimate gross profit and COGS for the period. Revenue and counts are real;
 * profit/COGS are estimates (we don't yet join each sale line to its unit cost),
 * so the UI labels them as such.
 */
export function computeProfitSummary(
  sales: InventorySaleSummary[],
  marginPercentage: number | null | undefined
): ProfitSummary {
  const revenue = sales.reduce((sum, sale) => sum + (sale.paid_amount ?? 0), 0);
  const unitsSold = sales.reduce(
    (sum, sale) => sum + (sale.total_quantity ?? 0),
    0
  );
  const margin = Math.max(0, Math.min(100, marginPercentage ?? 0));
  const estGrossProfit = Math.round((revenue * margin) / 100);

  return {
    estCogs: revenue - estGrossProfit,
    estGrossProfit,
    marginPercentage: margin,
    revenue,
    salesCount: sales.length,
    unitsSold,
  };
}

export type ProductPnlRow = {
  estCogs: number | null;
  estProfit: number | null;
  marginPercentage: number | null;
  productId: string;
  productName: string;
  revenue: number;
  unitCost: number | null;
  unitsSold: number;
};

function matchProfiles(
  row: InventoryProductSalesRow,
  profiles: InventoryCostProfile[]
): InventoryCostProfile[] {
  const name = row.productName.trim().toLowerCase();
  return profiles.filter(
    (profile) =>
      profile.productId === row.productId ||
      (profile.productName ?? '').trim().toLowerCase() === name ||
      profile.name.trim().toLowerCase() === name
  );
}

/**
 * Joins per-product ACTUAL sales (revenue, units) with the product's costing
 * profiles to estimate cost of goods, profit, and margin per product. Cost uses
 * the best matching scenario; rows with no matching costing leave cost/margin
 * null (revenue and units are still real).
 */
export function buildProductPnl(
  sales: InventoryProductSalesRow[],
  profiles: InventoryCostProfile[]
): ProductPnlRow[] {
  return sales.map((row) => {
    const margin = bestMarginAcrossProfiles(matchProfiles(row, profiles));
    const unitCost = margin?.unitCost ?? null;
    const estCogs = unitCost === null ? null : unitCost * row.unitsSold;
    const estProfit = estCogs === null ? null : row.revenue - estCogs;
    const marginPercentage =
      estProfit !== null && row.revenue > 0
        ? Math.round((estProfit / row.revenue) * 100)
        : null;

    return {
      estCogs,
      estProfit,
      marginPercentage,
      productId: row.productId,
      productName: row.productName,
      revenue: row.revenue,
      unitCost,
      unitsSold: row.unitsSold,
    };
  });
}
