import {
  formatTranscriptChunk,
  hasErasedTranscript,
  readTranscriptSegments,
  resolveTranscriptActionOwners,
} from '@tuturuuu/ai/meetings/transcript';
import 'server-only';
import type { MeetAiNotes } from '@tuturuuu/internal-api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';
import { generateBilledMeetArtifact } from './artifact-billing';
import { admitMeetCredits } from './credit-admission';
import { requireMeetTranscriptPayer } from './transcript-authority';
import { readTranscriptRoster } from './transcript-roster';
import { enforceMeetAiUsage } from './usage-limit';

type Chunk = Parameters<typeof formatTranscriptChunk>[0] & {
  status: string;
  transcript: string | null;
  usage: unknown;
  start_seconds: number;
  sequence: number;
};

export type MeetAiDraft = {
  sessionId: string;
  /** Completed chunks the draft covers; null notes when none hold speech. */
  basedOnChunks: number;
  notes: MeetAiNotes | null;
};

function hasSpeech(chunk: Chunk) {
  const segments = readTranscriptSegments(chunk.usage);
  return segments.length
    ? segments.some(
        (segment) =>
          !('erased' in segment) && Boolean(segment.transcript.trim())
      )
    : !hasErasedTranscript(chunk.usage) && Boolean(chunk.transcript?.trim());
}

/**
 * Live notes for the host's running session, from the transcript saved so
 * far. Nothing is stored: the final notes are generated when the session
 * stops. Each draft is one billed run for the host's payer, keyed by the
 * covered chunk count, so the same transcript is never charged twice, and it
 * counts against the notes limiter before any credit or provider work.
 */
export async function draftMeetAiNotes(input: {
  db: TypedSupabaseClient;
  meetingId: string;
  wsId: string;
  userId: string;
  sessionId: string;
  meetingStartedAt: string;
  timezone?: string;
}): Promise<MeetAiDraft> {
  const { db, meetingId, sessionId } = input;
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('id, ended_at')
    .eq('id', sessionId)
    .eq('meeting_id', meetingId)
    .eq('user_id', input.userId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  if (session.ended_at) throw new MeetAiError(409, 'Transcription has ended');
  const { data, error: chunkError } = await db
    .from('meet_ai_chunks')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'completed')
    .order('sequence')
    .range(0, 1080);
  if (chunkError) throw new MeetAiError(500, 'Transcript lookup failed');
  const chunks = (data ?? []) as unknown as Chunk[];
  if (!chunks.some(hasSpeech))
    return { sessionId, basedOnChunks: chunks.length, notes: null };
  const transcript = [...chunks]
    .sort(
      (a, b) => a.start_seconds - b.start_seconds || a.sequence - b.sequence
    )
    .map((chunk) => formatTranscriptChunk(chunk))
    .join('\n');
  if (transcript.length > 500_000)
    throw new MeetAiError(413, 'Transcript exceeds notes limit');
  await enforceMeetAiUsage({
    kind: 'notes',
    userId: input.userId,
    meetingId,
    workspaceId: input.wsId,
  });
  // The same entitlement and payer as the final notes.
  const { billingWorkspaceId } = await requireMeetTranscriptPayer({
    userId: input.userId,
    wsId: input.wsId,
    meetingId,
  });
  const admission = await admitMeetCredits(
    input.userId,
    meetingId,
    billingWorkspaceId
  );
  let result: Awaited<ReturnType<typeof generateBilledMeetArtifact>>;
  try {
    result = await generateBilledMeetArtifact(
      {
        transcript,
        meetingStartedAt: input.meetingStartedAt,
        timezone: input.timezone,
      },
      {
        userId: input.userId,
        meetingId,
        attemptId: `${sessionId}:draft:${chunks.length}`,
      },
      admission
    );
  } catch (cause) {
    // The same covered transcript already has a draft run.
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'status' in cause &&
      cause.status === 409 &&
      !(cause instanceof MeetAiError)
    )
      throw new MeetAiError(409, 'Live notes are already up to date');
    throw cause;
  }
  const notes = result.notes;
  if (!notes) return { sessionId, basedOnChunks: chunks.length, notes: null };
  const roster = await readTranscriptRoster(db, chunks);
  return {
    sessionId,
    basedOnChunks: chunks.length,
    notes: {
      ...notes,
      incomplete: true,
      actionItems: resolveTranscriptActionOwners(notes.actionItems, roster),
    },
  };
}
