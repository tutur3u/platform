import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import {
  resolveFeedbackEvidenceWindow,
  parseFeedbackTimestampInstant as timestamp,
} from './feedback-evidence-window';

type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;
export const MAX_FEEDBACK_EVIDENCE_RECORDS = 50;
export const MAX_FEEDBACK_EVIDENCE_BYTES = 32 * 1024;
export interface HumanFeedbackRecord {
  id: string;
  userId: string;
  groupId: string;
  creatorId: string | null;
  content: string;
  requireAttention: boolean;
  createdAt: string;
}
export interface FeedbackEvidenceMetadata extends FeedbackEvidenceInput {
  timezonePolicy: 'current-workspace';
  workspaceTimezone: string;
  scheduleTimezone: string | null;
  /** Unknown schedule zone is null, never inferred equal. */
  scheduleTimezoneMismatch: boolean | null;
  startInclusive: string;
  endExclusive: string;
  countReturned: number;
  incomplete: boolean;
  /** Observed omissions only; the query does not count the full dataset. */
  omittedAtLeast: number;
}
type WindowFailure = Extract<
  ReturnType<typeof resolveFeedbackEvidenceWindow>,
  { status: 'unavailable' }
>;
export type HumanFeedbackEvidence =
  | {
      status: 'ready';
      interpretation: 'quoted-observation-data';
      records: HumanFeedbackRecord[];
      metadata: FeedbackEvidenceMetadata;
    }
  | WindowFailure
  | {
      status: 'unavailable';
      reason:
        | 'invalid_input'
        | 'workspace_unavailable'
        | 'feedback_unavailable'
        | 'metadata_overflow';
    };
type ReadyEvidence = Extract<HumanFeedbackEvidence, { status: 'ready' }>;
type PeriodMetadata = Omit<
  FeedbackEvidenceMetadata,
  'countReturned' | 'incomplete' | 'omittedAtLeast'
>;
export interface FeedbackEvidenceInput {
  wsId: string;
  userId: string;
  groupId: string;
  periodStart: string;
  periodEnd: string;
  scheduleTimezone?: string | null;
}
function fail(
  reason: Exclude<HumanFeedbackEvidence, ReadyEvidence>['reason']
): HumanFeedbackEvidence {
  return { status: 'unavailable', reason };
}
function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
  );
}
function scheduleMismatch(schedule: string | null, workspace: string) {
  return schedule === null ? null : schedule !== workspace;
}
function validInput(input: FeedbackEvidenceInput) {
  return (
    identifier(input.wsId) &&
    identifier(input.userId) &&
    identifier(input.groupId) &&
    (input.scheduleTimezone == null ||
      (typeof input.scheduleTimezone === 'string' &&
        input.scheduleTimezone.length <= 128 &&
        input.scheduleTimezone.trim().length > 0))
  );
}
function projectRecord(
  value: unknown,
  meta: PeriodMetadata
): HumanFeedbackRecord | null {
  if (
    !object(value) ||
    !identifier(value.id) ||
    value.userId !== meta.userId ||
    value.groupId !== meta.groupId ||
    !(value.creatorId === null || identifier(value.creatorId)) ||
    typeof value.content !== 'string' ||
    typeof value.requireAttention !== 'boolean' ||
    typeof value.createdAt !== 'string'
  )
    return null;
  const instant = timestamp(value.createdAt);
  const start = timestamp(meta.startInclusive);
  const end = timestamp(meta.endExclusive);
  if (
    instant === null ||
    start === null ||
    end === null ||
    instant < start ||
    instant >= end
  )
    return null;
  return {
    id: value.id,
    userId: meta.userId,
    groupId: meta.groupId,
    creatorId: value.creatorId,
    content: value.content,
    requireAttention: value.requireAttention,
    createdAt: value.createdAt,
  };
}
export function boundHumanFeedbackEvidence(
  records: readonly HumanFeedbackRecord[],
  meta: PeriodMetadata
): HumanFeedbackEvidence {
  const result: ReadyEvidence = {
    status: 'ready',
    interpretation: 'quoted-observation-data',
    records: [],
    metadata: {
      wsId: meta.wsId,
      userId: meta.userId,
      groupId: meta.groupId,
      timezonePolicy: meta.timezonePolicy,
      workspaceTimezone: meta.workspaceTimezone,
      scheduleTimezone: meta.scheduleTimezone,
      scheduleTimezoneMismatch: meta.scheduleTimezoneMismatch,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      startInclusive: meta.startInclusive,
      endExclusive: meta.endExclusive,
      countReturned: 0,
      incomplete: records.length > 0,
      omittedAtLeast: records.length,
    },
  };
  if (serializedBytes(result) > MAX_FEEDBACK_EVIDENCE_BYTES)
    return fail('metadata_overflow');
  if (!validInput(meta) || meta.timezonePolicy !== 'current-workspace')
    return fail('invalid_input');
  const window = resolveFeedbackEvidenceWindow(
    meta.periodStart,
    meta.periodEnd,
    meta.workspaceTimezone
  );
  if (window.status === 'unavailable') return window;
  if (
    window.startInclusive !== meta.startInclusive ||
    window.endExclusive !== meta.endExclusive ||
    meta.scheduleTimezoneMismatch !==
      scheduleMismatch(meta.scheduleTimezone, meta.workspaceTimezone)
  )
    return fail('invalid_input');
  if (
    !Array.isArray(records) ||
    records.length > MAX_FEEDBACK_EVIDENCE_RECORDS + 1
  )
    return fail('feedback_unavailable');
  const projected: HumanFeedbackRecord[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const valid = projectRecord(record, meta);
    if (!valid || ids.has(valid.id)) return fail('feedback_unavailable');
    ids.add(valid.id);
    projected.push(valid);
  }
  projected.sort((a, b) => {
    const left = timestamp(a.createdAt);
    const right = timestamp(b.createdAt);
    if (left !== null && right !== null && left !== right)
      return left > right ? -1 : 1;
    return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
  });
  for (const record of projected) {
    if (result.records.length === MAX_FEEDBACK_EVIDENCE_RECORDS) break;
    const count = result.records.length + 1;
    const candidate: ReadyEvidence = {
      ...result,
      records: [...result.records, record],
      metadata: {
        ...result.metadata,
        countReturned: count,
        omittedAtLeast: records.length - count,
        incomplete: records.length > count,
      },
    };
    if (serializedBytes(candidate) > MAX_FEEDBACK_EVIDENCE_BYTES) break;
    result.records.push(record);
  }
  result.metadata.countReturned = result.records.length;
  result.metadata.omittedAtLeast = records.length - result.records.length;
  result.metadata.incomplete = result.metadata.omittedAtLeast > 0;
  // Measure the final entire envelope after final counts, even when no record fit.
  if (serializedBytes(result) > MAX_FEEDBACK_EVIDENCE_BYTES)
    return fail('metadata_overflow');
  return result;
}
export async function loadHumanFeedbackEvidence(
  client: AdminClient,
  input: FeedbackEvidenceInput
): Promise<HumanFeedbackEvidence> {
  if (!validInput(input)) return fail('invalid_input');
  let timezone: unknown;
  try {
    const lookup = client.from('workspaces').select('timezone');
    const workspace = await lookup.eq('id', input.wsId).maybeSingle();
    if (workspace.error || !object(workspace.data))
      return fail('workspace_unavailable');
    timezone = workspace.data.timezone;
  } catch {
    return fail('workspace_unavailable');
  }
  if (typeof timezone !== 'string' || !timezone.trim())
    return fail('timezone_unavailable');
  const window = resolveFeedbackEvidenceWindow(
    input.periodStart,
    input.periodEnd,
    timezone
  );
  if (window.status === 'unavailable') return window;
  const scheduleTimezone = input.scheduleTimezone ?? null;
  const meta: PeriodMetadata = {
    ...input,
    ...window,
    timezonePolicy: 'current-workspace',
    workspaceTimezone: timezone,
    scheduleTimezone,
    scheduleTimezoneMismatch: scheduleMismatch(scheduleTimezone, timezone),
  };
  try {
    const response = await client
      .from('user_feedbacks')
      .select(
        'id, user_id, group_id, creator_id, content, require_attention, created_at, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id), group:workspace_user_groups!user_feedbacks_group_id_fkey!inner(ws_id)'
      )
      .eq('user.ws_id', input.wsId)
      .eq('group.ws_id', input.wsId)
      .eq('user_id', input.userId)
      .eq('group_id', input.groupId)
      .gte('created_at', window.startInclusive)
      .lt('created_at', window.endExclusive)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_FEEDBACK_EVIDENCE_RECORDS + 1);
    if (
      response.error ||
      !Array.isArray(response.data) ||
      response.data.length > 51
    )
      return fail('feedback_unavailable');
    const records: HumanFeedbackRecord[] = [];
    for (const row of response.data) {
      if (
        !object(row.user) ||
        row.user.ws_id !== input.wsId ||
        !object(row.group) ||
        row.group.ws_id !== input.wsId
      )
        return fail('feedback_unavailable');
      const projected = projectRecord(
        {
          id: row.id,
          userId: row.user_id,
          groupId: row.group_id,
          creatorId: row.creator_id,
          content: row.content,
          requireAttention: row.require_attention,
          createdAt: row.created_at,
        },
        meta
      );
      if (!projected) return fail('feedback_unavailable');
      records.push(projected);
    }
    return boundHumanFeedbackEvidence(records, meta);
  } catch {
    return fail('feedback_unavailable');
  }
}
