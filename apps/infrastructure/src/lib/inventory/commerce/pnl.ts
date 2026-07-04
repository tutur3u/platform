import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type SaleLineForPnl = {
  product_id: string | null;
  quantity: number | null;
  subtotal_amount: number | null;
};

export type ProductSalesAggregate = {
  productId: string;
  revenue: number;
  unitsSold: number;
};

export type ProductSalesRow = ProductSalesAggregate & {
  productName: string;
};

/**
 * Aggregates completed-sale line items into per-product actual revenue and units
 * sold, sorted by revenue. Pure so the (money) aggregation is unit-testable.
 */
export function aggregateSalesByProduct(
  lines: SaleLineForPnl[]
): ProductSalesAggregate[] {
  const byProduct = new Map<string, ProductSalesAggregate>();

  for (const line of lines) {
    if (!line.product_id) continue;
    const entry = byProduct.get(line.product_id) ?? {
      productId: line.product_id,
      revenue: 0,
      unitsSold: 0,
    };
    entry.revenue += line.subtotal_amount ?? 0;
    entry.unitsSold += line.quantity ?? 0;
    byProduct.set(line.product_id, entry);
  }

  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * Returns actual revenue + units sold per product across completed storefront
 * sales (capped at the most recent `limit` sessions). Names are joined from the
 * products table; the caller pairs these with costing data for COGS/margin.
 */
export async function getInventorySalesByProduct({
  limit = 500,
  sbAdmin,
  wsId,
}: {
  limit?: number;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<ProductSalesRow[]> {
  const privateDb = sbAdmin.schema('private');

  const { data: sessions } = await privateDb
    .from('inventory_checkout_sessions')
    .select('id')
    .eq('ws_id', wsId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  const sessionIds = (sessions ?? []).map((session) => session.id);
  if (sessionIds.length === 0) return [];

  const { data: lines } = await privateDb
    .from('inventory_checkout_lines')
    .select('product_id, quantity, subtotal_amount')
    .in('checkout_session_id', sessionIds);

  const aggregates = aggregateSalesByProduct(lines ?? []);
  if (aggregates.length === 0) return [];

  const { data: products } = await sbAdmin
    .from('workspace_products')
    .select('id, name')
    .in(
      'id',
      aggregates.map((entry) => entry.productId)
    );

  const nameById = new Map(
    (products ?? []).map((product) => [product.id, product.name])
  );

  return aggregates.map((entry) => ({
    ...entry,
    productName: nameById.get(entry.productId) ?? entry.productId,
  }));
}
