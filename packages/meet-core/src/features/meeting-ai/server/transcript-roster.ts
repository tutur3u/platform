import 'server-only';
import {
  transcriptSpeakerIdentity,
  transcriptSpeakers,
} from '@tuturuuu/ai/meetings/transcript';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

/** Resolve only surviving source identities against current profiles, never stored names. */
export async function readTranscriptRoster(
  db: TypedSupabaseClient,
  chunks: ReadonlyArray<{ usage: unknown }>
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      chunks.flatMap((chunk) =>
        transcriptSpeakers(chunk.usage).flatMap((speaker) => {
          const identity = transcriptSpeakerIdentity(speaker);
          return 'accountId' in identity ? [identity.accountId] : [];
        })
      )
    ),
  ];
  const roster = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const profiles = await db
      .from('users')
      .select('id, display_name')
      .in('id', ids.slice(offset, offset + 100));
    if (profiles.error)
      throw new MeetAiError(503, 'Transcript roster unavailable');
    for (const profile of profiles.data) {
      const name = profile.display_name?.trim();
      roster.set(
        profile.id,
        name && !/\S+@\S+/.test(name) ? name : 'Participant'
      );
    }
  }
  return roster;
}
