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
  const profile = await input.db
    .from('users')
    .select('display_name')
    .eq('id', verified.accountId)
    .maybeSingle();
  if (profile.error) throw new MeetAiError(503, 'Speaker identity unavailable');
  const savedName = profile.data?.display_name?.trim();
  const displayName =
    savedName && !/\S+@\S+/.test(savedName) ? savedName : 'Participant';
  return {
    accountId: verified.accountId,
    displayName,
    kind: input.kind ?? 'microphone',
  };
}
