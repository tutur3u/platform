import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types/supabase';
import type { HumanFeedbackEvidence } from './feedback-evidence';
import { resolveFeedbackEvidenceWindow } from './feedback-evidence-window';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;
type ReportUpdate =
  Database['private']['Tables']['external_user_monthly_reports']['Update'];
export type ReportCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface ReportIdentity {
  wsId: string;
  userId: string;
  groupId: string;
  reportId: string;
  cadence: ReportCadence;
  periodStart: string;
  periodEnd: string;
}
export interface ScheduleOrigin {
  status: 'verified-automation' | 'origin-unavailable';
  automationRunId: string | null;
  scheduleId: string | null;
  scheduleTimezone: string | null;
}
export const REPORT_GENERATION_FIELDS =
  'id, user_id, group_id, cadence, period_start, period_end, manager_instruction, updated_at, generation_status, source_context';
export function canonicalId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
  );
}
export function reportCadence(value: unknown): value is ReportCadence {
  return (
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'quarterly' ||
    value === 'yearly'
  );
}
export function snapshotReportIdentity(
  input: ReportIdentity
): Readonly<ReportIdentity> {
  if (
    ![input.wsId, input.userId, input.groupId, input.reportId].every(
      canonicalId
    ) ||
    !reportCadence(input.cadence) ||
    resolveFeedbackEvidenceWindow(input.periodStart, input.periodEnd, 'UTC')
      .status !== 'ready'
  )
    throw new Error('Invalid report identity');
  return Object.freeze({
    wsId: input.wsId,
    userId: input.userId,
    groupId: input.groupId,
    reportId: input.reportId,
    cadence: input.cadence,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
}
export function sourceObject(source: Json | null): {
  [key: string]: Json | undefined;
} {
  return source !== null && typeof source === 'object' && !Array.isArray(source)
    ? { ...source }
    : {};
}
const unknownOrigin = (): ScheduleOrigin => ({
  status: 'origin-unavailable',
  automationRunId: null,
  scheduleId: null,
  scheduleTimezone: null,
});
export async function resolveReportScheduleOrigin(
  client: AdminClient,
  identity: ReportIdentity,
  source: Json | null
): Promise<ScheduleOrigin> {
  const runId = sourceObject(source).automation_run_id;
  if (!canonicalId(runId)) return unknownOrigin();
  try {
    const db = client.schema('private');
    const run = await db
      .from('user_report_automation_runs')
      .select(
        'id, schedule_id, ws_id, group_id, cadence, period_start, period_end'
      )
      .eq('id', runId)
      .eq('ws_id', identity.wsId)
      .eq('group_id', identity.groupId)
      .eq('cadence', identity.cadence)
      .eq('period_start', identity.periodStart)
      .eq('period_end', identity.periodEnd)
      .maybeSingle();
    if (
      run.error ||
      !run.data ||
      run.data.id !== runId ||
      run.data.ws_id !== identity.wsId ||
      run.data.group_id !== identity.groupId ||
      run.data.cadence !== identity.cadence ||
      run.data.period_start !== identity.periodStart ||
      run.data.period_end !== identity.periodEnd ||
      !canonicalId(run.data.schedule_id)
    )
      return unknownOrigin();
    const schedule = await db
      .from('user_report_schedules')
      .select('id, ws_id, group_id, cadence, timezone')
      .eq('id', run.data.schedule_id)
      .eq('ws_id', identity.wsId)
      .eq('cadence', identity.cadence)
      .maybeSingle();
    if (
      schedule.error ||
      !schedule.data ||
      schedule.data.id !== run.data.schedule_id ||
      schedule.data.ws_id !== identity.wsId ||
      schedule.data.cadence !== identity.cadence ||
      (schedule.data.group_id !== null &&
        schedule.data.group_id !== identity.groupId)
    )
      return unknownOrigin();
    return {
      status: 'verified-automation',
      automationRunId: runId,
      scheduleId: schedule.data.id,
      scheduleTimezone: schedule.data.timezone,
    };
  } catch {
    return unknownOrigin();
  }
}
export function feedbackEvidenceJson(evidence: HumanFeedbackEvidence): Json {
  if (evidence.status === 'unavailable')
    return { status: evidence.status, reason: evidence.reason };
  const m = evidence.metadata;
  return {
    status: evidence.status,
    interpretation: evidence.interpretation,
    records: evidence.records.map((r) => ({
      id: r.id,
      userId: r.userId,
      groupId: r.groupId,
      creatorId: r.creatorId,
      content: r.content,
      requireAttention: r.requireAttention,
      createdAt: r.createdAt,
    })),
    metadata: {
      wsId: m.wsId,
      userId: m.userId,
      groupId: m.groupId,
      periodStart: m.periodStart,
      periodEnd: m.periodEnd,
      timezonePolicy: m.timezonePolicy,
      workspaceTimezone: m.workspaceTimezone,
      scheduleTimezone: m.scheduleTimezone,
      scheduleTimezoneMismatch: m.scheduleTimezoneMismatch,
      startInclusive: m.startInclusive,
      endExclusive: m.endExclusive,
      countReturned: m.countReturned,
      incomplete: m.incomplete,
      omittedAtLeast: m.omittedAtLeast,
    },
  };
}
export function generationAttempt(
  identity: ReportIdentity,
  origin: ScheduleOrigin,
  evidence: HumanFeedbackEvidence | null,
  status: 'ready' | 'failed',
  revision: string,
  reason: string | null
): Json {
  return {
    identity: { ...identity },
    scheduleOrigin: { ...origin },
    status,
    claimRevision: revision,
    reason,
    humanFeedback:
      evidence === null
        ? { status: 'not_loaded' }
        : feedbackEvidenceJson(evidence),
    workspaceTimezone:
      evidence?.status === 'ready' ? evidence.metadata.workspaceTimezone : null,
    startInclusive:
      evidence?.status === 'ready' ? evidence.metadata.startInclusive : null,
    endExclusive:
      evidence?.status === 'ready' ? evidence.metadata.endExclusive : null,
  };
}
export class GenerationWriteError extends Error {
  constructor(public readonly outcome: 'conflict' | 'write_unacknowledged') {
    super(outcome);
  }
}
export function nextGenerationRevision(previous: string): string {
  const instant = Date.parse(previous);
  if (!Number.isFinite(instant)) throw new Error('Invalid report revision');
  return new Date(Math.max(Date.now(), instant + 1)).toISOString();
}
export function conditionalReportWrite(
  client: AdminClient,
  identity: ReportIdentity,
  managerInstruction: string | null,
  revision: string,
  status: string,
  payload: ReportUpdate
) {
  let query = client
    .schema('private')
    .from('external_user_monthly_reports')
    .update(payload)
    .eq('id', identity.reportId)
    .eq('user_id', identity.userId)
    .eq('group_id', identity.groupId)
    .eq('cadence', identity.cadence)
    .eq('period_start', identity.periodStart)
    .eq('period_end', identity.periodEnd)
    .eq('generation_mode', 'ai')
    .eq('updated_at', revision)
    .eq('generation_status', status);
  query =
    managerInstruction === null
      ? query.is('manager_instruction', null)
      : query.eq('manager_instruction', managerInstruction);
  return query.select(REPORT_GENERATION_FIELDS).maybeSingle();
}
export function requireGenerationWrite(result: {
  data: { updated_at: string } | null;
  error: unknown;
}) {
  if (result.error) throw new GenerationWriteError('write_unacknowledged');
  if (!result.data) throw new GenerationWriteError('conflict');
  return result.data.updated_at;
}

export function reportIdentityFromRow(
  wsId: string,
  row: Pick<
    Database['private']['Tables']['external_user_monthly_reports']['Row'],
    'id' | 'user_id' | 'group_id' | 'cadence' | 'period_start' | 'period_end'
  >
) {
  if (!reportCadence(row.cadence)) throw new Error('Invalid report cadence');
  return snapshotReportIdentity({
    wsId,
    reportId: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    cadence: row.cadence,
    periodStart: row.period_start ?? '',
    periodEnd: row.period_end ?? '',
  });
}
export function successfulGenerationSource(
  prior: Json | null,
  identity: ReportIdentity,
  origin: ScheduleOrigin,
  evidence: HumanFeedbackEvidence,
  metrics: Record<string, Json>,
  revision: string,
  manual = false
): Json {
  return {
    ...sourceObject(prior),
    ...(manual ? { generation_source: 'manual_request' } : {}),
    ...(origin.status === 'verified-automation'
      ? { automation_run_id: origin.automationRunId }
      : {}),
    metrics,
    human_feedback: feedbackEvidenceJson(evidence),
    last_successful_generation_context: generationAttempt(
      identity,
      origin,
      evidence,
      'ready',
      revision,
      null
    ),
    latest_generation_attempt: generationAttempt(
      identity,
      origin,
      evidence,
      'ready',
      revision,
      null
    ),
  };
}

export function failedGenerationSource(
  prior: Json | null,
  identity: ReportIdentity,
  origin: ScheduleOrigin,
  evidence: HumanFeedbackEvidence | null,
  revision: string,
  reason: string
): Json {
  return {
    ...sourceObject(prior),
    latest_generation_attempt: generationAttempt(
      identity,
      origin,
      evidence,
      'failed',
      revision,
      reason
    ),
  };
}
export function validAutomationScope(run: {
  id: string;
  ws_id: string;
  group_id: string | null;
  schedule_id: string;
  cadence: string;
  period_start: string;
  period_end: string;
}) {
  return (
    [run.id, run.ws_id, run.group_id, run.schedule_id].every(canonicalId) &&
    reportCadence(run.cadence) &&
    resolveFeedbackEvidenceWindow(run.period_start, run.period_end, 'UTC')
      .status === 'ready'
  );
}
