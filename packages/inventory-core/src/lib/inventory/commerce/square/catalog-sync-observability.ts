export type SquareCatalogLinkObservabilityInput = {
  last_error: string | null;
  last_synced_at: string | null;
  product_id: string;
  square_item_id: string;
  square_item_name: string | null;
  square_sku: string | null;
  square_variation_id: string;
  square_variation_name: string | null;
  status: 'active' | 'conflict' | 'error' | 'remote_deleted';
  sync_origin: 'square' | 'tuturuuu';
  unit_id: string;
  warehouse_id: string;
};

export function mapSquareCatalogLinkObservability({
  links,
  productNames,
}: {
  links: SquareCatalogLinkObservabilityInput[];
  productNames: Map<string, string | null>;
}) {
  return links.map((link) => ({
    lastError: link.last_error,
    lastSyncedAt: link.last_synced_at,
    productId: link.product_id,
    productName:
      productNames.get(link.product_id) ??
      link.square_item_name ??
      'Unknown product',
    squareItemId: link.square_item_id,
    squareItemName: link.square_item_name,
    squareSku: link.square_sku,
    squareVariationId: link.square_variation_id,
    squareVariationName: link.square_variation_name,
    status: link.status,
    syncOrigin: link.sync_origin,
    unitId: link.unit_id,
    warehouseId: link.warehouse_id,
  }));
}
