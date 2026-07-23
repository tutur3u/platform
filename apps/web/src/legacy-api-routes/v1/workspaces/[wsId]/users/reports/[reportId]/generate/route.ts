import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';
import { loadScopedReportContext } from '@/lib/user-report-automation/context';
import { generatePeriodicReportNarrative } from '@/lib/user-report-automation/generation';

interface Params {
  params: Promise<{ reportId: string; wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { reportId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (
    !permissions?.containsPermission('manage_user_report_automation') &&
    !permissions?.containsPermission('create_user_groups_reports')
  ) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');
  const reportResult = await privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select('*')
    .eq('id', reportId)
    .eq('user_ws_id', wsId)
    .maybeSingle();
  if (reportResult.error) throw reportResult.error;
  const report = reportResult.data;
  if (!report) {
    return NextResponse.json({ message: 'Report not found' }, { status: 404 });
  }
  if (report.generation_mode !== 'ai') {
    return NextResponse.json(
      { message: 'Only AI-mode reports can be generated.' },
      { status: 409 }
    );
  }
  if (!report.period_start || !report.period_end) {
    return NextResponse.json(
      { message: 'A calendar period is required before generation.' },
      { status: 409 }
    );
  }
  if (
    !report.user_id ||
    !report.group_id ||
    !['weekly', 'monthly', 'quarterly', 'yearly'].includes(report.cadence ?? '')
  ) {
    return NextResponse.json(
      { message: 'A valid subject, group, and cadence are required.' },
      { status: 409 }
    );
  }

  const cadence = report.cadence as
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'yearly';

  const startResult = await privateDb
    .from('external_user_monthly_reports')
    .update({
      generation_status: 'generating',
      last_delivery_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);
  if (startResult.error) throw startResult.error;

  try {
    const scopedContext = await loadScopedReportContext(sbAdmin, {
      cadence,
      groupId: report.group_id,
      periodEnd: report.period_end,
      periodStart: report.period_start,
      reportId,
      userId: report.user_id,
      wsId,
    });

    const narrative = await generatePeriodicReportNarrative({
      cadence,
      deterministicMetrics: scopedContext.deterministicMetrics,
      group: { id: report.group_id, name: report.group_name },
      managerInstruction: report.manager_instruction,
      periodEnd: report.period_end,
      periodStart: report.period_start,
      previousReport: scopedContext.previousReport,
      subject: {
        displayName: report.user_display_name,
        fullName: report.user_full_name,
        note: report.user_note,
      },
    });

    const updateResult = await privateDb
      .from('external_user_monthly_reports')
      .update({
        content: narrative.content,
        feedback: narrative.feedback,
        generation_status: 'ready',
        report_approval_status: 'PENDING',
        source_context: {
          generation_source: 'manual_request',
          metrics: scopedContext.deterministicMetrics,
        },
        title: narrative.title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);
    if (updateResult.error) throw updateResult.error;

    return NextResponse.json({ queued: false, report: narrative });
  } catch (error) {
    console.error('Periodic report generation failed:', error);
    await privateDb
      .from('external_user_monthly_reports')
      .update({
        generation_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);
    return NextResponse.json(
      { message: 'Report generation failed. The draft is safe to retry.' },
      { status: 500 }
    );
  }
}
