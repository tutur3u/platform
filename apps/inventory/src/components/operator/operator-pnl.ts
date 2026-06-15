import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';

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
