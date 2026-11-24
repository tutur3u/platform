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
   * `system_fallback`: the server turned an older room back off after an on
   * it could not record (rooms without two-phase Mira support only).
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
  /** The room's pending id for an "on", confirmed only after this row lands. */
  pendingId?: string;
};

/**
 * When the choice table last refused an optional column. Detection is
 * retried after a short while, never latched for good.
 */
const columnMissingAt = new Map<'notice_mode' | 'pending_id', number>();
export const NOTICE_MODE_PROBE_TTL_MS = 60_000;

const columnMissing = (column: 'notice_mode' | 'pending_id') => {
  const at = columnMissingAt.get(column);
  return at !== undefined && Date.now() - at < NOTICE_MODE_PROBE_TTL_MS;
};
const noticeModeMissing = () => columnMissing('notice_mode');

/** A choice row the database refused, with its Postgres error code. */
export class MiraChoiceRecordError extends Error {
  constructor(public pgCode?: string) {
    super('Mira choice could not be recorded');
    this.name = 'MiraChoiceRecordError';
  }
}

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
    columnMissingAt.delete('notice_mode');
    return true;
  }
  if (MISSING_COLUMN.has(error.code ?? '')) {
    columnMissingAt.set('notice_mode', Date.now());
    return false;
  }
  throw new Error('Mira choice storage could not be checked');
}

/** The optional column a missing-column error names, when it names one. */
function missingColumnOf(error: { code?: string; message?: string }) {
  if (!MISSING_COLUMN.has(error.code ?? '')) return undefined;
  const message = error.message ?? '';
  if (message.includes('pending_id')) return 'pending_id' as const;
  if (message.includes('notice_mode')) return 'notice_mode' as const;
  return undefined;
}

/**
 * Appends one participant's own choice; accounts are pseudonymized in SQL.
 * An "off" is always stored: without an optional column the table cannot
 * take yet, so a withdrawal is never lost. A per-speaker "on" that must keep
 * its notice mode fails instead of dropping it.
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
  const extras: { notice_mode?: 'self'; pending_id?: string } = {};
  if (self && (required || !noticeModeMissing())) extras.notice_mode = 'self';
  if (input.pendingId && !columnMissing('pending_id'))
    extras.pending_id = input.pendingId;
  const insert = () =>
    db
      .from('meet_mira_participant_choices')
      .insert({ ...row, ...extras } as typeof row);
  let { error } = await insert();
  // Feature check: a column the table lacks is named in PGRST204; drop it
  // and retry, unless the row must keep it. At most one retry per column.
  for (let attempt = 0; error && attempt < 2; attempt++) {
    if (!MISSING_COLUMN.has(error.code ?? '')) break;
    // An unnamed missing column is the only optional one sent, or the newer.
    const column =
      missingColumnOf(error) ??
      (extras.pending_id !== undefined
        ? ('pending_id' as const)
        : extras.notice_mode !== undefined
          ? ('notice_mode' as const)
          : undefined);
    if (!column || !(column in extras)) break;
    columnMissingAt.set(column, Date.now());
    if (column === 'notice_mode' && required)
      throw new Error('Mira choice notice mode cannot be stored');
    delete extras[column];
    ({ error } = await insert());
  }
  if (!error)
    for (const column of Object.keys(extras) as Array<keyof typeof extras>)
      columnMissingAt.delete(column);
  if (error) throw new MiraChoiceRecordError(error.code);
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

/**
 * The caller's own latest Mira choice in one meeting, from the durable
 * evidence, for the join box before the room will answer them. It reads only
 * the caller's own rows: an account by its user id, a guest by its
 * server-issued guest id, both taken from the authenticated session and
 * never from the request. Returns `undefined` when the lookup fails, so the
 * caller can show the box unticked instead of guessing.
 */
export async function readOwnMiraLastChoice(input: {
  meetingId: string;
  participantId: string;
  guest: boolean;
}): Promise<'on' | 'off' | null | undefined> {
  try {
    const db = await privateDb();
    const rows = db
      .from('meet_mira_participant_choices')
      .select('choice')
      .eq('meeting_id', input.meetingId);
    const { data, error } = await (
      input.guest
        ? rows.eq('guest', true).eq('participant_ref', input.participantId)
        : rows.eq('guest', false).eq('user_id', input.participantId)
    )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return undefined;
    return data?.choice === 'on' || data?.choice === 'off' ? data.choice : null;
  } catch {
    return undefined;
  }
}
