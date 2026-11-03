import 'server-only';
import type { MeetTranscriptSpeaker } from '@tuturuuu/ai/meetings/transcript';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { callRoomService } from '@tuturuuu/meet-core/features/call/server/room-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { MeetAiError } from './access';

const rosterSchema = z.object({
  accountIds: z.array(z.uuid()).min(1),
  hasGuests: z.boolean(),
});
const refused = () =>
  new MeetAiError(
    403,
    'Room consent required',
    'MEET_AI_ROSTER_CONSENT_REQUIRED'
  );

export async function requireChunkConsent(
  db: TypedSupabaseClient,
  sessionId: string,
  speakers: (MeetTranscriptSpeaker | null)[],
  meetingId: string,
  actorId: string
) {
  if (speakers.some((speaker) => !speaker)) throw refused();
  const room = await getMeetCallAccess(meetingId, 'Participant');
  if (room.user.id !== actorId) throw new MeetAiError(409, 'Account changed');
  const roster = rosterSchema.safeParse(
    await callRoomService<unknown>(room, { action: 'transcription.roster' })
  );
  if (!roster.success) throw new MeetAiError(503, 'Room consent unavailable');
  if (roster.data.hasGuests) throw refused();
  // Attribution labels cannot prove whose audio a microphone or share contains.
  // Read the authoritative roster anew at every boundary, including persistence.
  const accounts = new Set(roster.data.accountIds);
  for (const speaker of speakers) if (speaker) accounts.add(speaker.accountId);
  for (const accountId of accounts) {
    const store = db.schema('private');
    const { data, error } = await store.rpc('meet_ai_self_v1_consent_state', {
      p_session_id: sessionId,
      p_account_id: accountId,
    });
    if (error) throw new MeetAiError(503, 'Room consent unavailable');
    if (
      data?.length !== 1 ||
      data[0]?.decision !== 'allow' ||
      !Number.isInteger(data[0].revision) ||
      data[0].revision < 1
    )
      throw refused();
    const grant = await store
      .from('meet_ai_session_participants')
      .select('consent_revision, upload_revoked_at')
      .eq('session_id', sessionId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (grant.error) throw new MeetAiError(503, 'Upload grant unavailable');
    if (
      !grant.data ||
      grant.data.upload_revoked_at !== null ||
      grant.data.consent_revision !== data[0].revision
    )
      throw refused();
  }
}
