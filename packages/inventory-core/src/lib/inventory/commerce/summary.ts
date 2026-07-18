import type {
  InventoryCommerceSummary,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import { minorToMajor, normalizeAmount } from '@tuturuuu/utils/money';

export function summarizeInventorySales({
  currency,
  marginPercentage,
  sales,
}: {
  currency: string;
  marginPercentage: number;
  sales: InventorySaleSummary[];
}): InventoryCommerceSummary {
  const workspaceCurrency = currency.toUpperCase();
  let excludedCurrencyCount = 0;
  let revenue = 0;
  let salesCount = 0;
  let unitsSold = 0;

  for (const sale of sales) {
    const saleCurrency =
      sale.source === 'finance_invoice'
        ? workspaceCurrency
        : (sale.currency ?? workspaceCurrency).toUpperCase();

    if (saleCurrency !== workspaceCurrency) {
      excludedCurrencyCount += 1;
      continue;
    }

    revenue +=
      sale.source === 'finance_invoice'
        ? sale.paid_amount
        : minorToMajor(sale.paid_amount, saleCurrency);
    salesCount += 1;
    unitsSold += sale.total_quantity ?? 0;
  }

  const normalizedRevenue = normalizeAmount(revenue, workspaceCurrency);
  const normalizedMargin = Math.max(0, Math.min(100, marginPercentage));

  return {
    currency: workspaceCurrency,
    estimatedGrossMarginPercentage: normalizedMargin,
    estimatedGrossProfit: normalizeAmount(
      (normalizedRevenue * normalizedMargin) / 100,
      workspaceCurrency
    ),
    excludedCurrencyCount,
    revenue: normalizedRevenue,
    salesCount,
    unitsSold,
  };
}
