import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';

// Checked against the generated schema so a misspelled table fails type-check.
export const TIME_TRACKING_REFERENCE_TABLES = [
  'time_tracking_categories',
  'workspace_break_types',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

export type TimeTrackingReferenceTable =
  (typeof TIME_TRACKING_REFERENCE_TABLES)[number];

export async function validateTimeTrackingReference({
  client,
  id,
  table,
  wsId,
}: {
  client: TypedSupabaseClient;
  id: string | null | undefined;
  table: TimeTrackingReferenceTable;
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
