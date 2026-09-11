import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { reportConfigs } from '@tuturuuu/utils/configs/reports';
import { renderReportEmail } from './email-template';

/** Resolve only workspace-scoped report data and allowlisted display configuration. */
export async function loadReportEmailPreview(
  admin: Awaited<ReturnType<typeof createAdminClient<Database>>>,
  wsId: string,
  reportId: string
) {
  const [reportResult, configsResult] = await Promise.all([
    admin
      .schema('private')
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id,title,content,feedback,score,user_full_name,group_name,creator_full_name,user_email,report_approval_status'
      )
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle(),
    admin
      .from('workspace_configs')
      .select('id,value')
      .eq('ws_id', wsId)
      .in(
        'id',
        reportConfigs.map((config) => config.id!)
      ),
  ]);
  if (reportResult.error) throw reportResult.error;
  if (configsResult.error) throw configsResult.error;
  if (!reportResult.data) throw new Error('Report not found');
  const report = reportResult.data;
  const configs = Object.fromEntries(
    (configsResult.data ?? []).map(({ id, value }) => [id, value ?? ''])
  );
  return {
    approvalStatus: report.report_approval_status,
    title: report.title ?? '',
    content: report.content ?? '',
    feedback: report.feedback ?? '',
    recipient: report.user_email,
    html: renderReportEmail(
      {
        title: report.title,
        content: report.content,
        feedback: report.feedback,
        score: report.score,
        userName: report.user_full_name,
        groupName: report.group_name,
        teacherName: report.creator_full_name,
      },
      configs
    ),
  };
}
