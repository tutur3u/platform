import type { TypedSupabaseClient } from '@tuturuuu/supabase';

export async function validateTimeTrackingReference({
  client,
  id,
  table,
  wsId,
}: {
  client: TypedSupabaseClient;
  id: string | null | undefined;
  table: 'time_tracking_categories' | 'time_tracking_break_types';
  wsId: string;
}): Promise<{ message: string; status: 400 | 500 } | null> {
  if (!id) return null;
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error)
    return {
      message: 'Failed to validate time tracking reference',
      status: 500,
    };
  if (!data) return { message: 'Invalid time tracking reference', status: 400 };
  return null;
}
