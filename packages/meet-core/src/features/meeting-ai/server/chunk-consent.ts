import 'server-only';
import type { MeetTranscriptSpeaker } from '@tuturuuu/ai/meetings/transcript';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

export async function requireChunkConsent(
  db: TypedSupabaseClient,
  sessionId: string,
  speakers: (MeetTranscriptSpeaker | null)[]
) {
  for (const speaker of speakers) {
    if (!speaker) throw new MeetAiError(403, 'Speaker identity required');
    // #7309 owns the legal-store ordering and current-decision semantics.
    const { data, error } = await db
      .schema('private')
      .rpc('meet_ai_self_v1_consent_state', {
        p_session_id: sessionId,
        p_account_id: speaker.accountId,
      });
    if (error) throw new MeetAiError(503, 'Speaker consent unavailable');
    if (
      data?.length !== 1 ||
      data[0]?.decision !== 'allow' ||
      data[0].revision < 1
    )
      throw new MeetAiError(403, 'Speaker consent required');
  }
}
