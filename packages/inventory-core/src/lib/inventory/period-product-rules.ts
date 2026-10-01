import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
export async function validatePeriodProducts({
  productIds,
  sbAdmin,
  wsId,
}: {
  productIds: string[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return uniqueIds;
  const { data, error } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', uniqueIds);
  if (error) throw error;
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error('One or more sales period products were not found');
  }
  return uniqueIds;
}

export async function replacePeriodProducts({
  periodId,
  productIds,
  sbAdmin,
  wsId,
}: {
  periodId: string;
  productIds: string[];
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const uniqueIds = await validatePeriodProducts({ productIds, sbAdmin, wsId });
  const table = sbAdmin
    .schema('private')
    .from('inventory_sales_period_products' as never);
  const { error: deleteError } = await table
    .delete()
    .eq('ws_id', wsId)
    .eq('period_id', periodId);
  if (deleteError) throw deleteError;
  if (uniqueIds.length === 0) return;

  const { error } = await table.insert(
    uniqueIds.map((productId) => ({
      period_id: periodId,
      product_id: productId,
      ws_id: wsId,
    })) as never
  );
  if (error) throw error;
}
