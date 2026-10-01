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
  // The transaction applies before and after first-price authoring. Never route
  // an edit using a price-existence read that can become stale before its writes.
  try {
    return await periodPricingRpc<{
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
  } catch (error) {
    if (!isMissingPricingTransaction(error)) throw error;
    const probe = await sbAdmin
      .schema('private')
      .from('inventory_product_prices')
      .select('id')
      .limit(0);
    if (probe.error && ['42P01', 'PGRST205'].includes(probe.error.code))
      return null;
    // If price support exists, an absent edit transaction must fail closed.
    throw error;
  }
}

export function isMissingPricingTransaction(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['42883', 'PGRST202'].includes(String(error.code))
  );
}
