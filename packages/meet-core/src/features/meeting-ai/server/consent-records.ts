import 'server-only';
import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { MeetConsentDecision } from '../consent/notice';
import { MeetAiError } from './access';

export type MeetConsentRecord = {
  id?: string;
  user_id: string | null;
  decision: MeetConsentDecision;
  created_at: string;
};

// Missing relation or schema: private.meet_ai_consents (#7264) is not applied.
const UNAVAILABLE = new Set(['42P01', '3F000', 'PGRST106', 'PGRST205']);

// The consent log lands in #7264; address it untyped until types regenerate.
function consentLog(db: TypedSupabaseClient) {
  return (db as unknown as SupabaseClient)
    .schema('private')
    .from('meet_ai_consents');
}

/** Per-account decisions kept per session; further changes are refused. */
export const MEET_CONSENT_MAX_DECISIONS = 20;
// Bounds the one read per upload; a full page fails closed rather than truncating.
const SESSION_READ_LIMIT = 2000;

/**
 * Evidence rows for one session (or one account in it), oldest first, ordered
 * by (created_at, id). Returns null when the log is not deployed.
 */
export async function readMeetConsentRecords(
  db: TypedSupabaseClient,
  sessionId: string,
  userId?: string
): Promise<MeetConsentRecord[] | null> {
  const limit = userId ? MEET_CONSENT_MAX_DECISIONS : SESSION_READ_LIMIT;
  let query = consentLog(db)
    .select('id, user_id, decision, created_at')
    .eq('session_id', sessionId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    if (UNAVAILABLE.has(error.code ?? '')) return null;
    throw new MeetAiError(503, 'Consent records are unavailable');
  }
  const rows = (data ?? []) as MeetConsentRecord[];
  if (!userId && rows.length >= limit)
    throw new MeetAiError(503, 'Consent records are unavailable');
  return rows.reverse();
}

/** Append one decision. The log is append-only; the latest row wins. */
export async function appendMeetConsentRecord(
  db: TypedSupabaseClient,
  record: {
    sessionId: string;
    userId: string;
    decision: MeetConsentDecision;
    noticeVersion: string;
  }
) {
  const { error } = await consentLog(db).insert({
    session_id: record.sessionId,
    user_id: record.userId,
    decision: record.decision,
    notice_version: record.noticeVersion,
  });
  if (error)
    throw new MeetAiError(
      503,
      'Consent could not be recorded',
      'MEET_AI_CONSENT_UNAVAILABLE'
    );
}

/** Latest decision per account, for the host roster. */
export function latestMeetConsents(records: MeetConsentRecord[]) {
  const latest: Record<string, MeetConsentDecision> = {};
  for (const record of records)
    if (record.user_id) latest[record.user_id] = record.decision;
  return latest;
}
