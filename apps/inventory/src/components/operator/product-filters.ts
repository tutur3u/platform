import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';

export function filterInventoryProducts(
  products: InventoryProductSummary[],
  filters: { ownerId: string; warehouseId: string }
) {
  return products.filter((product) => {
    if (filters.ownerId && product.owner_id !== filters.ownerId) return false;
    if (
      filters.warehouseId &&
      !(product.inventory ?? []).some(
        (stock) => stock.warehouse_id === filters.warehouseId
      )
    ) {
      return false;
    }
    return true;
  });
}
