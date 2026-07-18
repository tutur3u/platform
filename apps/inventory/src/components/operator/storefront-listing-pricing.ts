import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { majorToMinor } from '@tuturuuu/utils/money';

export type PreferredListingStock = {
  amount: number | null;
  price: number;
  unitId: string;
  warehouseId: string;
};

export function getPreferredListingStock(
  product: InventoryProductSummary | undefined
): PreferredListingStock | null {
  const rows = (product?.inventory ?? []).flatMap((row) => {
    const unitId = typeof row.unit_id === 'string' ? row.unit_id : '';
    const warehouseId =
      typeof row.warehouse_id === 'string' ? row.warehouse_id : '';
    const price = typeof row.price === 'number' ? row.price : Number(row.price);
    if (!unitId || !warehouseId || !Number.isFinite(price)) return [];
    return [
      {
        amount: typeof row.amount === 'number' ? row.amount : null,
        price: Math.max(0, price),
        unitId,
        warehouseId,
      },
    ];
  });
  return (
    rows.sort((left, right) => {
      const leftAvailable = left.amount === null || left.amount > 0 ? 0 : 1;
      const rightAvailable = right.amount === null || right.amount > 0 ? 0 : 1;
      return leftAvailable - rightAvailable;
    })[0] ?? null
  );
}

export function getStockPriceMinor(
  product: InventoryProductSummary | undefined,
  currency: string
) {
  const stock = getPreferredListingStock(product);
  return stock ? majorToMinor(stock.price, currency) : null;
}
