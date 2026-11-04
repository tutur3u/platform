import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function hasLinkedProductInWorkspace({
  sbAdmin,
  wsId,
  productId,
  warehouseId,
  unitId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  productId: string;
  warehouseId: string;
  unitId: string;
}) {
  // Inventory tables live in the private schema (see
  // 20260528141100_move_inventory_tables_private.sql); only workspace_products
  // stays in public.
  const inventory = sbAdmin.schema('private');
  const results = await Promise.all([
    sbAdmin
      .from('workspace_products')
      .select('id')
      .eq('id', productId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    inventory
      .from('inventory_warehouses')
      .select('id')
      .eq('id', warehouseId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    inventory
      .from('inventory_units')
      .select('id')
      .eq('id', unitId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    inventory
      .from('inventory_products')
      .select('product_id')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .eq('unit_id', unitId)
      .maybeSingle(),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
  }
  return results.every((result) => result.data !== null);
}
