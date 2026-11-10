import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function isReportBulkApprovalEnabled(
  admin: TypedSupabaseClient,
  wsId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('id', 'ALLOW_BULK_REPORT_APPROVAL')
    .maybeSingle();
  if (error) throw error;
  return data?.value === 'true';
}
