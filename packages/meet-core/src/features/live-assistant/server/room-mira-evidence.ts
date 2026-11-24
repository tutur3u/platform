import 'server-only';
import type {
  MiraRoomCapability,
  MiraRoomEndReason,
} from '@tuturuuu/realtime/meet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * Durable room Mira consent evidence, written with the service role after
 * the meeting room has made the decision. Rows are append-only; the room
 * Durable Object remains the runtime authority.
 */
async function privateDb() {
  return (await createAdminClient({ noCookie: true })).schema('private');
}

/** Allocates the meeting's next acceptance revision and records it. */
export async function recordMiraAcceptance(input: {
  meetingId: string;
  userId: string;
  noticeVersion: string;
  capabilities: MiraRoomCapability[];
}) {
  const db = await privateDb();
  const { data, error } = await db.rpc('record_meet_mira_acceptance', {
    p_meeting_id: input.meetingId,
    p_user_id: input.userId,
    p_notice_version: input.noticeVersion,
    p_capabilities: input.capabilities,
  });
  const row = Array.isArray(data) ? data[0] : undefined;
  if (error || !row) throw new Error('Mira acceptance could not be recorded');
  return row.revision;
}

export type MiraAcceptanceEnd =
  | MiraRoomEndReason
  | 'expanded'
  | 'not_applied'
  | 'restored';

/** Records the end of one acceptance revision; repeated ends are no-ops. */
export async function endMiraAcceptance(input: {
  meetingId: string;
  revision: number;
  userId: string | null;
  reason: MiraAcceptanceEnd;
}) {
  const db = await privateDb();
  const { error } = await db.rpc('end_meet_mira_acceptance', {
    p_meeting_id: input.meetingId,
    p_revision: input.revision,
    // The function accepts NULL for an end with no acting user; generated
    // RPC argument types are non-null.
    p_user_id: input.userId ?? (null as unknown as string),
    p_reason: input.reason,
  });
  if (error) throw new Error('Mira acceptance end could not be recorded');
}

export type MiraChoiceEvidence = {
  meetingId: string;
  wsId: string;
  /** Account id, or the server-issued guest participant id. */
  participantId: string;
  guest: boolean;
  choice: 'on' | 'off';
  /**
   * `system_fallback`: the server turned the room back off after an on it
   * could not record.
   */
  source: 'join' | 'confirm' | 'toggle' | 'system_fallback';
  acceptanceRevision: number;
  noticeVersion: string;
  textHash: string;
  locale: string;
  /**
   * Set only for a choice made under the per-speaker notice; room-capture
   * choices omit it and keep the stored default.
   */
  noticeMode?: 'self';
  /**
   * The room is in per-speaker mode: an "on" must be stored with its mode.
   * Ignored for "off", which is always stored, with or without the mode.
   */
  requireNoticeMode?: boolean;
};

/**
 * When the choice table last refused the `notice_mode` column. Detection is
 * retried after a short while, never latched for good.
 */
let noticeModeMissingAt: number | undefined;
export const NOTICE_MODE_PROBE_TTL_MS = 60_000;

const noticeModeMissing = () =>
  noticeModeMissingAt !== undefined &&
  Date.now() - noticeModeMissingAt < NOTICE_MODE_PROBE_TTL_MS;

/** PostgREST answers these when a column is unknown to its schema cache. */
const MISSING_COLUMN = new Set(['PGRST204', '42703']);

/**
 * Whether a choice can be stored with its notice mode. Checked before the
 * room records an "on", so an "on" that would need the mode is refused before
 * the room changes. A failed probe throws; the caller fails closed.
 */
export async function canStoreMiraNoticeMode() {
  if (noticeModeMissing()) return false;
  const db = await privateDb();
  // The column is not in the generated types until its migration lands.
  const table = db.from('meet_mira_participant_choices') as unknown as {
    select: (columns: string) => {
      limit: (
        count: number
      ) => PromiseLike<{ error: { code?: string } | null }>;
    };
  };
  const { error } = await table.select('notice_mode').limit(0);
  if (!error) {
    noticeModeMissingAt = undefined;
    return true;
  }
  if (MISSING_COLUMN.has(error.code ?? '')) {
    noticeModeMissingAt = Date.now();
    return false;
  }
  throw new Error('Mira choice storage could not be checked');
}

/**
 * Appends one participant's own choice; accounts are pseudonymized in SQL.
 * An "off" is always stored: without the notice mode when the column cannot
 * take it, so a withdrawal is never lost.
 */
export async function recordMiraChoice(input: MiraChoiceEvidence) {
  const db = await privateDb();
  const row = {
    meeting_id: input.meetingId,
    // SQL rederives it from the meeting, so a mismatch cannot be stored.
    ws_id: input.wsId,
    acceptance_revision: input.acceptanceRevision,
    guest: input.guest,
    user_id: input.guest ? null : input.participantId,
    participant_ref: input.participantId,
    choice: input.choice,
    source: input.source,
    notice_version: input.noticeVersion,
    text_hash: input.textHash,
    locale: input.locale,
  };
  const required = input.choice === 'on' && !!input.requireNoticeMode;
  const self = input.noticeMode === 'self';
  if (self && required && noticeModeMissing())
    throw new Error('Mira choice notice mode cannot be stored');
  const withMode = self && (required || !noticeModeMissing());
  const insert = (mode: boolean) =>
    db
      .from('meet_mira_participant_choices')
      .insert((mode ? { ...row, notice_mode: 'self' } : row) as typeof row);
  let { error } = await insert(withMode);
  // Feature check: without the column PostgREST answers PGRST204.
  if (withMode && MISSING_COLUMN.has(error?.code ?? '')) {
    noticeModeMissingAt = Date.now();
    if (required) throw new Error('Mira choice notice mode cannot be stored');
    ({ error } = await insert(false));
  } else if (withMode && !error) noticeModeMissingAt = undefined;
  if (error) throw new Error('Mira choice could not be recorded');
}

/** The workspace default for the join tick box; ticked unless changed. */
export async function readMiraBoxTickedByDefault(wsId: string) {
  const db = await privateDb();
  const { data, error } = await db
    .from('workspace_mira_consent_defaults')
    .select('box_ticked')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Mira consent default lookup failed');
  return data?.box_ticked ?? true;
}

/**
 * The join box default for a meeting's guest page. A failed lookup shows the
 * box unticked, the stricter form, rather than guessing ticked.
 */
export async function readMiraBoxTickedByDefaultForMeeting(meetingId: string) {
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db
      .from('workspace_meetings')
      .select('ws_id')
      .eq('id', meetingId)
      .maybeSingle();
    if (error || !data) return false;
    return await readMiraBoxTickedByDefault(data.ws_id);
  } catch {
    return false;
  }
}

/**
 * The acceptance revision open for a meeting now, 0 when none is open or the
 * lookup fails. A join screen keeps it so a Join state applies only to the
 * acceptance the participant could have seen; 0 never matches one.
 */
export async function readOpenMiraAcceptanceRevision(meetingId: string) {
  try {
    const db = await privateDb();
    const { data, error } = await db
      .from('meet_mira_host_acceptances')
      .select('revision, event')
      .eq('meeting_id', meetingId)
      .order('revision', { ascending: false })
      .limit(2);
    if (error || !data?.length) return 0;
    const latest = data[0]!.revision;
    const ended = data.some(
      (row) => row.revision === latest && row.event === 'end'
    );
    return ended ? 0 : latest;
  } catch {
    return 0;
  }
}
