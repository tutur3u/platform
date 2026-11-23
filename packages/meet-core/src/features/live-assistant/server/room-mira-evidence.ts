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
    p_user_id: input.userId,
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
  source: 'join' | 'confirm' | 'toggle';
  acceptanceRevision: number;
  noticeVersion: string;
  textHash: string;
  locale: string;
};

/** Appends one participant's own choice; accounts are pseudonymized in SQL. */
export async function recordMiraChoice(input: MiraChoiceEvidence) {
  const db = await privateDb();
  const { error } = await db.from('meet_mira_participant_choices').insert({
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
  });
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
