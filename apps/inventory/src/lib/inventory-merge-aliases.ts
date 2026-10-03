import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/** Older schemas cannot execute merges, so they have no aliases to hide. */
export async function getMergedWarehouseIds(
  admin: TypedSupabaseClient,
  wsId: string
) {
  const { data, error } = await admin
    .schema('private')
    .from('inventory_identity_merges')
    .select('source_id')
    .eq('ws_id', wsId)
    .eq('kind', 'warehouse');
  if (error && !['42P01', 'PGRST205'].includes(error.code)) {
    return { ids: [] as string[], error };
  }
  return { ids: (data ?? []).map((row) => row.source_id), error: null };
}
