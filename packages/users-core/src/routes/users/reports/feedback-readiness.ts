import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { hasReportFeedback } from '../../../features/reports/report-feedback';

/** Check the already-authorized batch before any queue or audit mutation. */
export async function countReportsWithoutFeedback(
  client: TypedSupabaseClient,
  wsId: string,
  reportIds: string[]
) {
  if (reportIds.length === 0) return 0;
  const { data, error } = await client
    .schema('private')
    .from('external_user_monthly_reports_workspace_view')
    .select('id, feedback')
    .eq('user_ws_id', wsId)
    .eq('group_ws_id', wsId)
    .in('id', reportIds);
  if (error) throw error;
  const rows = new Map((data ?? []).map((row) => [row.id, row]));
  // A missing or moved report is not eligible to send either.
  return reportIds.filter((id) => !hasReportFeedback(rows.get(id)?.feedback))
    .length;
}
