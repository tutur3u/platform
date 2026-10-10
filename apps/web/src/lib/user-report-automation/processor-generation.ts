import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { loadScopedReportContext } from './context';
import {
  conditionalReportWrite,
  failedGenerationSource,
  GenerationWriteError,
  nextGenerationRevision,
  REPORT_GENERATION_FIELDS,
  reportIdentityFromRow,
  requireGenerationWrite,
  type ScheduleOrigin,
  successfulGenerationSource,
  validAutomationScope,
} from './feedback-consumer';
import type { HumanFeedbackEvidence } from './feedback-evidence';
import { generatePeriodicReportNarrative } from './generation';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

function getPrivateDb(client: AdminClient) {
  return client.schema('private');
}

type PrivateClient = ReturnType<typeof getPrivateDb>;

export interface AutomationRun {
  attempt_count: number;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  generation_mode: 'manual' | 'ai';
  group_id: string | null;
  id: string;
  period_end: string;
  period_start: string;
  schedule_id: string;
  ws_id: string;
}

export function getRetryAt(attemptCount: number) {
  const delayMinutes = Math.min(
    12 * 60,
    5 * 2 ** Math.max(0, attemptCount - 1)
  );
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function markRunFailure(
  privateDb: PrivateClient,
  run: AutomationRun,
  error: unknown
) {
  const message = error instanceof Error ? error.message : 'Unknown run error';
  const permanent = run.attempt_count >= 5;
  console.error('periodic_report.generation_failed', {
    runId: run.id,
    workspaceId: run.ws_id,
    attempt: run.attempt_count,
    permanent,
  });
  await privateDb
    .from('user_report_automation_runs')
    .update({
      last_error: message,
      locked_at: null,
      locked_by: null,
      next_attempt_at: getRetryAt(run.attempt_count),
      status: permanent ? 'cancelled' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);
}

export async function processAutomationRun(
  sbAdmin: AdminClient,
  run: AutomationRun
) {
  const privateDb = getPrivateDb(sbAdmin);
  try {
    if (!run.group_id) throw new Error('Automation run has no group scope');
    if (!validAutomationScope(run)) throw new Error('Invalid automation scope');
    const [scheduleResult, membershipsResult, groupResult] = await Promise.all([
      privateDb
        .from('user_report_schedules')
        .select(
          'id, ws_id, group_id, cadence, timezone, created_by, manager_instruction'
        )
        .eq('id', run.schedule_id)
        .eq('ws_id', run.ws_id)
        .eq('cadence', run.cadence)
        .single(),
      sbAdmin
        .from('workspace_user_groups_users')
        .select('user_id')
        .eq('group_id', run.group_id),
      sbAdmin
        .from('workspace_user_groups')
        .select('name, ws_id')
        .eq('id', run.group_id)
        .eq('ws_id', run.ws_id)
        .single(),
    ]);
    if (scheduleResult.error) throw scheduleResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (groupResult.error) throw groupResult.error;
    if (
      groupResult.data.ws_id !== run.ws_id ||
      scheduleResult.data.ws_id !== run.ws_id ||
      scheduleResult.data.id !== run.schedule_id ||
      scheduleResult.data.cadence !== run.cadence ||
      (scheduleResult.data.group_id !== null &&
        scheduleResult.data.group_id !== run.group_id)
    )
      throw new Error('Automation scope mismatch');
    // A null schedule group is the workspace default expanded by reconciliation.
    const scheduleOrigin: ScheduleOrigin = {
      status: 'verified-automation',
      automationRunId: run.id,
      scheduleId: run.schedule_id,
      scheduleTimezone: scheduleResult.data.timezone,
    };
    const userIds = (membershipsResult.data ?? []).map(
      (membership) => membership.user_id
    );
    const usersResult =
      userIds.length > 0
        ? await sbAdmin
            .from('workspace_users')
            .select('id, display_name, full_name, note')
            .eq('ws_id', run.ws_id)
            .in('id', userIds)
            .eq('archived', false)
        : { data: [], error: null };
    if (usersResult.error) throw usersResult.error;
    let createdReports = 0;
    for (const user of usersResult.data ?? []) {
      const existing = await privateDb
        .from('external_user_monthly_reports')
        .select(REPORT_GENERATION_FIELDS)
        .eq('user_id', user.id)
        .eq('group_id', run.group_id)
        .eq('cadence', run.cadence)
        .eq('period_start', run.period_start)
        .eq('period_end', run.period_end)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (
        existing.data &&
        (run.generation_mode !== 'ai' ||
          !['failed', 'generating'].includes(existing.data.generation_status))
      )
        continue;
      const userName = user.display_name ?? user.full_name ?? 'Member';
      const title = `${run.cadence[0]?.toUpperCase()}${run.cadence.slice(1)} report · ${userName}`;
      const original = existing.data;
      const originalIdentity = original
        ? reportIdentityFromRow(run.ws_id, original)
        : null;
      const created =
        original && originalIdentity
          ? await conditionalReportWrite(
              sbAdmin,
              originalIdentity,
              original.manager_instruction,
              original.updated_at,
              original.generation_status,
              {
                generation_status: 'generating',
                updated_at: nextGenerationRevision(original.updated_at),
              }
            )
          : await privateDb
              .from('external_user_monthly_reports')
              .insert({
                cadence: run.cadence,
                content: '',
                creator_id: scheduleResult.data.created_by,
                feedback: '',
                generation_mode: run.generation_mode,
                generation_status:
                  run.generation_mode === 'ai' ? 'generating' : 'draft',
                group_id: run.group_id,
                manager_instruction: scheduleResult.data.manager_instruction,
                period_end: run.period_end,
                period_start: run.period_start,
                report_approval_status: 'PENDING',
                source_context: { automation_run_id: run.id, metrics: {} },
                title,
                updated_at: new Date().toISOString(),
                updated_by: scheduleResult.data.created_by,
                user_id: user.id,
              })
              .select(REPORT_GENERATION_FIELDS)
              .single();
      const revision = requireGenerationWrite(created);
      const admitted = created.data;
      if (!admitted) throw new GenerationWriteError('conflict');
      if (!original) createdReports++;
      const identity = reportIdentityFromRow(run.ws_id, admitted);
      if (
        identity.userId !== user.id ||
        identity.groupId !== run.group_id ||
        admitted.cadence !== run.cadence ||
        identity.periodStart !== run.period_start ||
        identity.periodEnd !== run.period_end ||
        (original &&
          admitted.manager_instruction !== original.manager_instruction)
      )
        throw new Error('Report acknowledgement mismatch');
      const managerInstruction = admitted.manager_instruction;
      if (run.generation_mode === 'ai') {
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
            group: { id: identity.groupId, name: groupResult.data.name },
            managerInstruction,
            periodEnd: identity.periodEnd,
            periodStart: identity.periodStart,
            subject: {
              displayName: user.display_name,
              fullName: user.full_name,
              note: user.note,
            },
          });
          failureReason = 'save_unacknowledged';
          const generated = await conditionalReportWrite(
            sbAdmin,
            identity,
            managerInstruction,
            revision,
            'generating',
            {
              content: narrative.content,
              feedback: narrative.feedback,
              generation_status: 'ready',
              report_approval_status: 'PENDING',
              title: narrative.title,
              updated_at: nextGenerationRevision(revision),
              source_context: successfulGenerationSource(
                admitted.source_context,
                identity,
                scheduleOrigin,
                evidence,
                scopedContext.deterministicMetrics,
                revision
              ),
            }
          );
          requireGenerationWrite(generated);
        } catch (error) {
          // A stale/uncertain save is never followed by an unconditional failure write.
          if (
            error instanceof GenerationWriteError &&
            error.outcome === 'conflict'
          )
            throw error;
          const failed = await conditionalReportWrite(
            sbAdmin,
            identity,
            managerInstruction,
            revision,
            'generating',
            {
              generation_status: 'failed',
              updated_at: nextGenerationRevision(revision),
              source_context: failedGenerationSource(
                admitted.source_context,
                identity,
                scheduleOrigin,
                evidence,
                revision,
                failureReason
              ),
            }
          );
          requireGenerationWrite(failed);
          throw error;
        }
      }
    }
    const completed = await privateDb
      .from('user_report_automation_runs')
      .update({
        completed_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        locked_by: null,
        result: { created_reports: createdReports },
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (completed.error) throw completed.error;
  } catch (error) {
    await markRunFailure(privateDb, run, error);
  }
}
