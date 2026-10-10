import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';
import { loadScopedReportContext } from '@/lib/user-report-automation/context';
import {
  conditionalReportWrite,
  GenerationWriteError,
  generationAttempt,
  nextGenerationRevision,
  type ReportIdentity,
  reportCadence,
  requireGenerationWrite,
  resolveReportScheduleOrigin,
  snapshotReportIdentity,
  sourceObject,
  successfulGenerationSource,
} from '@/lib/user-report-automation/feedback-consumer';
import type { HumanFeedbackEvidence } from '@/lib/user-report-automation/feedback-evidence';
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
  )
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  const sbAdmin = await createAdminClient();
  const reportResult = await sbAdmin
    .schema('private')
    .from('external_user_monthly_reports_workspace_view')
    .select('*')
    .eq('id', reportId)
    .eq('user_ws_id', wsId)
    .eq('group_ws_id', wsId)
    .maybeSingle();
  if (reportResult.error) throw reportResult.error;
  const report = reportResult.data;
  if (!report || report.user_ws_id !== wsId || report.group_ws_id !== wsId)
    return NextResponse.json({ message: 'Report not found' }, { status: 404 });
  if (
    report.generation_mode !== 'ai' ||
    !reportCadence(report.cadence) ||
    !report.user_id ||
    !report.group_id ||
    !report.period_start ||
    !report.period_end ||
    !report.updated_at ||
    !report.generation_status
  )
    return NextResponse.json(
      { message: 'A valid AI report scope and revision are required.' },
      { status: 409 }
    );
  if (report.generation_status === 'generating')
    return NextResponse.json(
      {
        message: 'Report generation is already in progress.',
        outcome: 'conflict',
      },
      { status: 409 }
    );
  let identity: Readonly<ReportIdentity>;
  try {
    identity = snapshotReportIdentity({
      wsId,
      reportId,
      userId: report.user_id,
      groupId: report.group_id,
      cadence: report.cadence,
      periodStart: report.period_start,
      periodEnd: report.period_end,
    });
  } catch {
    return NextResponse.json(
      { message: 'Invalid report identity.' },
      { status: 409 }
    );
  }
  const managerInstruction = report.manager_instruction;
  const priorSource = sourceObject(report.source_context);
  const scheduleOrigin = await resolveReportScheduleOrigin(
    sbAdmin,
    identity,
    report.source_context
  );
  let revision: string;
  try {
    revision = requireGenerationWrite(
      await conditionalReportWrite(
        sbAdmin,
        identity,
        managerInstruction,
        report.updated_at,
        report.generation_status,
        {
          generation_status: 'generating',
          updated_at: nextGenerationRevision(report.updated_at),
        }
      )
    );
  } catch (error) {
    return writeFailure(error);
  }
  let evidence: HumanFeedbackEvidence | null = null;
  let failureReason = 'context_unavailable';
  try {
    const scopedContext = await loadScopedReportContext(sbAdmin, {
      ...identity,
      scheduleOrigin,
    });
    evidence = scopedContext.humanFeedbackEvidence;
    if (evidence.status === 'unavailable') {
      failureReason = 'human_feedback_unavailable';
      throw new Error(failureReason);
    }
    failureReason = 'model_failed';
    const narrative = await generatePeriodicReportNarrative({
      ...scopedContext,
      cadence: identity.cadence,
      group: { id: identity.groupId, name: report.group_name },
      managerInstruction,
      periodStart: identity.periodStart,
      periodEnd: identity.periodEnd,
      subject: {
        displayName: report.user_display_name,
        fullName: report.user_full_name,
        note: report.user_note,
      },
    });
    failureReason = 'save_unacknowledged';
    requireGenerationWrite(
      await conditionalReportWrite(
        sbAdmin,
        identity,
        managerInstruction,
        revision,
        'generating',
        {
          content: narrative.content,
          feedback: narrative.feedback,
          title: narrative.title,
          generation_status: 'ready',
          report_approval_status: 'PENDING',
          updated_at: nextGenerationRevision(revision),
          source_context: successfulGenerationSource(
            report.source_context,
            identity,
            scheduleOrigin,
            evidence,
            scopedContext.deterministicMetrics,
            revision,
            true
          ),
        }
      )
    );
    return NextResponse.json({ queued: false, report: narrative });
  } catch (error) {
    if (error instanceof GenerationWriteError && error.outcome === 'conflict')
      return writeFailure(error);
    try {
      requireGenerationWrite(
        await conditionalReportWrite(
          sbAdmin,
          identity,
          managerInstruction,
          revision,
          'generating',
          {
            generation_status: 'failed',
            updated_at: nextGenerationRevision(revision),
            source_context: {
              ...priorSource,
              latest_generation_attempt: generationAttempt(
                identity,
                scheduleOrigin,
                evidence,
                'failed',
                revision,
                failureReason
              ),
            },
          }
        )
      );
    } catch (writeError) {
      return writeFailure(writeError);
    }
    // A rejected ready write remains unacknowledged even if failure metadata was saved.
    if (error instanceof GenerationWriteError) return writeFailure(error);
    return NextResponse.json(
      { message: 'Report generation failed.', outcome: 'failed' },
      { status: 500 }
    );
  }
}
function writeFailure(error: unknown) {
  const outcome =
    error instanceof GenerationWriteError
      ? error.outcome
      : 'write_unacknowledged';
  return NextResponse.json(
    { message: 'Report generation write was not acknowledged.', outcome },
    { status: outcome === 'conflict' ? 409 : 500 }
  );
}
