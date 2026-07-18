import type {
  InventoryProductInventoryItem,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';

export type ProductBulkSelection = {
  inventoryIndex: number | null;
  key: string;
  product: InventoryProductSummary;
};

export type ProductBulkChanges = {
  amount?: number | null;
  ownerId?: string;
  warehouseId?: string;
};

export function buildBulkInventoryUpdates(
  selections: ProductBulkSelection[],
  changes: ProductBulkChanges
) {
  const selectedIndexes = new Map<string, Set<number>>();
  for (const selection of selections) {
    if (selection.inventoryIndex == null) continue;
    const indexes = selectedIndexes.get(selection.product.id) ?? new Set();
    indexes.add(selection.inventoryIndex);
    selectedIndexes.set(selection.product.id, indexes);
  }

  const updates = new Map<string, InventoryProductInventoryItem[]>();
  for (const selection of selections) {
    const product = selection.product;
    if (updates.has(product.id)) continue;
    const indexes = selectedIndexes.get(product.id);
    if (!indexes?.size) continue;
    const inventory = (product.inventory ?? []).map((row, index) => {
      const item = inventoryItem(row);
      if (!indexes.has(index)) return item;
      return {
        ...item,
        ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
        ...(changes.warehouseId ? { warehouse_id: changes.warehouseId } : {}),
      };
    });
    const targets = inventory.map(
      (item) => `${item.warehouse_id}:${item.unit_id}`
    );
    if (new Set(targets).size !== targets.length) {
      throw new Error('duplicate_stock_target');
    }
    updates.set(product.id, inventory);
  }

  return updates;
}

function inventoryItem(
  row: Record<string, unknown>
): InventoryProductInventoryItem {
  return {
    amount: nullableNumber(row.amount),
    min_amount: numberValue(row.min_amount),
    price: numberValue(row.price),
    revenue_share_bps: numberValue(row.revenue_share_bps),
    revenue_share_partner_id: stringValue(row.revenue_share_partner_id) || null,
    unit_id: stringValue(row.unit_id),
    warehouse_id: stringValue(row.warehouse_id),
  };
}

function nullableNumber(value: unknown) {
  return value == null ? null : numberValue(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
