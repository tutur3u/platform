import 'server-only';
import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { MeetConsentDecision } from '../consent/notice';
import { MeetAiError } from './access';

export type MeetConsentRecord = {
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

/** Evidence rows for one session, oldest first; null when the log is absent. */
export async function readMeetConsentRecords(
  db: TypedSupabaseClient,
  sessionId: string
): Promise<MeetConsentRecord[] | null> {
  const { data, error } = await consentLog(db)
    .select('user_id, decision, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    if (UNAVAILABLE.has(error.code ?? '')) return null;
    throw new MeetAiError(503, 'Consent records are unavailable');
  }
  return (data ?? []) as MeetConsentRecord[];
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
