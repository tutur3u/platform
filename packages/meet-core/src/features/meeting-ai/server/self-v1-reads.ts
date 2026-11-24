import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';
import { readTranscriptRoster } from './transcript-roster';

export type MeetSelfSegment = {
  chunk_id: string;
  account_id: string;
  stream_id: string;
  sequence: number;
  start_ms: number;
  end_ms: number;
  timing_uncertainty_ms: number;
  transcript: string;
  is_own: boolean;
};

const PAGE = 500;
/** Matches the room-capture display bound. */
const MAX_SEGMENTS = 20_000;

/**
 * Every segment the reader may see, through the self_v1 read contract only:
 * own speech always; host and admins everything; participants others only
 * while shared. Hidden, fenced, discarded and redacted rows never appear.
 */
export async function listSelfSegments(
  db: TypedSupabaseClient,
  sessionId: string,
  readerId: string
): Promise<MeetSelfSegment[]> {
  const segments: MeetSelfSegment[] = [];
  let cursor: MeetSelfSegment | undefined;
  while (true) {
    const { data, error } = await db
      .schema('private')
      .rpc('list_meet_ai_self_v1_segments', {
        p_session_id: sessionId,
        p_reader_id: readerId,
        p_limit: PAGE,
        ...(cursor
          ? {
              p_after_start_ms: cursor.start_ms,
              p_after_account_id: cursor.account_id,
              p_after_stream_id: cursor.stream_id,
              p_after_sequence: cursor.sequence,
            }
          : {}),
      });
    if (error) throw new MeetAiError(503, 'Transcript lookup failed');
    const page = (data ?? []) as MeetSelfSegment[];
    segments.push(...page);
    if (segments.length > MAX_SEGMENTS)
      throw new MeetAiError(413, 'Meeting transcript exceeds display limit');
    if (page.length < PAGE) return segments;
    cursor = page.at(-1);
  }
}

export async function readSelfNotes(
  db: TypedSupabaseClient,
  sessionId: string,
  readerId: string
) {
  const { data, error } = await db
    .schema('private')
    .rpc('get_meet_ai_self_v1_notes', {
      p_session_id: sessionId,
      p_reader_id: readerId,
    });
  if (error) throw new MeetAiError(503, 'Notes lookup failed');
  return data?.[0] ?? null;
}

export async function listSelfCoverage(
  db: TypedSupabaseClient,
  sessionId: string,
  readerId: string
) {
  const { data, error } = await db
    .schema('private')
    .rpc('list_meet_ai_self_v1_coverage', {
      p_session_id: sessionId,
      p_reader_id: readerId,
    });
  if (error) throw new MeetAiError(503, 'Coverage lookup failed');
  return data ?? [];
}

/** Current profile names for the segment speakers; stored labels are never used. */
export function readSelfRoster(
  db: TypedSupabaseClient,
  segments: ReadonlyArray<{ account_id: string }>
) {
  return readTranscriptRoster(
    db,
    [...new Set(segments.map((segment) => segment.account_id))].map(
      (accountId) => ({
        usage: {
          speaker: { accountId, displayName: 'Participant', kind: 'microphone' },
        },
      })
    )
  );
}

/** The notes prompt line for one segment, in the room-capture line format. */
export function formatSelfSegment(segment: MeetSelfSegment) {
  return JSON.stringify({
    seconds: segment.start_ms / 1000,
    source: { accountId: segment.account_id, kind: 'microphone' },
    kind: 'microphone',
    text: segment.transcript,
  });
}
