import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { periodPricingRpc } from './period-pricing';

export async function editPricedProduct({
  sbAdmin,
  wsId,
  productId,
  metadata,
  inventory,
  workspaceUserId = null,
  context = {},
  recordChanges = false,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  productId: string;
  metadata?: object;
  inventory?: readonly object[];
  workspaceUserId?: string | null;
  context?: { beneficiary_id?: string | null; note?: string | null };
  recordChanges?: boolean;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_product_prices')
    .select('id')
    .eq('ws_id', wsId)
    .eq('product_id', productId)
    .limit(1);
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return null;
    throw error;
  }
  if (!data?.length) return null;
  return periodPricingRpc<{
    deleted: number;
    inserted: number;
    updated: number;
  }>(sbAdmin, 'edit_inventory_priced_product', {
    p_ws_id: wsId,
    p_product_id: productId,
    p_metadata: metadata ?? null,
    p_inventory: inventory ?? null,
    p_workspace_user_id: workspaceUserId,
    p_context: context,
    p_record_changes: recordChanges,
  });
}
