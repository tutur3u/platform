import 'server-only';
import type { MeetTranscriptSpeaker } from '@tuturuuu/ai/meetings/transcript';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { callRoomService } from '@tuturuuu/meet-core/features/call/server/room-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

/** Client metadata identifies a source; only admitted accounts may supply its label. */
export async function resolveTranscriptSpeaker(input: {
  db: TypedSupabaseClient;
  meetingId: string;
  actorId: string;
  accountId?: string;
  kind?: 'microphone' | 'shared_audio';
}): Promise<MeetTranscriptSpeaker | null> {
  if (!input.accountId) return null;
  const room = await getMeetCallAccess(input.meetingId, 'Participant');
  if (room.user.id !== input.actorId)
    throw new MeetAiError(409, 'Account changed');
  const verified = await callRoomService<{ accountId: string }>(room, {
    action: 'transcription.speaker',
    accountId: input.accountId,
  });
  if (verified.accountId !== input.accountId)
    throw new MeetAiError(403, 'Unknown audio source');
  const [profile, details] = await Promise.all([
    input.db
      .from('users')
      .select('display_name')
      .eq('id', verified.accountId)
      .maybeSingle(),
    input.db
      .from('user_private_details')
      .select('email')
      .eq('user_id', verified.accountId)
      .maybeSingle(),
  ]);
  if (profile.error || details.error)
    throw new MeetAiError(503, 'Speaker identity unavailable');
  const displayName =
    profile.data?.display_name?.trim() || details.data?.email?.trim();
  // Never invent an identity or use an unverified client-supplied name.
  if (!displayName) return null;
  return {
    accountId: verified.accountId,
    displayName,
    kind: input.kind ?? 'microphone',
  };
}
