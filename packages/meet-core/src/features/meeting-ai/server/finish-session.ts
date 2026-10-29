import {
  formatTranscriptChunk,
  readTranscriptSegments,
  transcriptSpeakers,
} from '@tuturuuu/ai/meetings/transcript';
import { generateBilledMeetArtifact } from './artifact-billing';
import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, Tables } from '@tuturuuu/types';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import { MeetAiError } from './access';
import { consentedChunks } from './consent-filter';

/**
 * Finish a transcription session and generate its notes at most once.
 * The compare-and-set claim on `notes_status` / `notes_started_at` (existing
 * columns) is the lease: concurrent finishers, the host's click and the
 * automatic finalizer all race for it, and only the winner reaches the
 * provider and the bill.
 *
 * With `consentedAccountIds`, only speech from those accounts is used.
 */
export async function finishMeetAiSession(input: {
  db: TypedSupabaseClient;
  session: Tables<'meet_ai_sessions'>;
  userId: string;
  meetingId: string;
  meetingStartedAt: string | null;
  timezone?: string;
  expectedChunks?: number;
  captureIncomplete?: boolean;
  consentedAccountIds?: ReadonlySet<string>;
}): Promise<'generated' | 'already'> {
  const { db, session, meetingId } = input;
  const sessionId = session.id;
  if (session.notes_status === 'completed') return 'already';
  if (
    session.notes_status === 'processing' &&
    session.notes_started_at &&
    Date.now() - Date.parse(session.notes_started_at) > 120_000
  ) {
    const recovered = await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        notes_unpriced_attempts: session.notes_unpriced_attempts + 1,
      })
      .eq('id', sessionId)
      .eq('notes_status', 'processing')
      .eq('notes_started_at', session.notes_started_at)
      .select('id')
      .maybeSingle();
    if (recovered.error || !recovered.data)
      throw new MeetAiError(409, 'Notes are still processing');
    session.notes_unpriced_attempts++;
  }
  const ended = await db
    .from('meet_ai_sessions')
    .update({ ended_at: session.ended_at ?? new Date().toISOString() })
    .eq('id', sessionId);
  if (ended.error) throw new MeetAiError(500, 'Could not stop transcription');
  const { data: chunks, error: chunkError } = await db
    .from('meet_ai_chunks')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence')
    .range(0, 1080);
  if (chunks?.length === 1000) {
    const rest = await db
      .from('meet_ai_chunks')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence')
      .range(1000, 1080);
    if (rest.error) throw new MeetAiError(500, 'Transcript lookup failed');
    chunks.push(...rest.data);
  }
  if (chunkError) throw new MeetAiError(500, 'Transcript lookup failed');
  if (
    chunks.some(
      (chunk) =>
        chunk.status === 'processing' &&
        Date.now() - Date.parse(chunk.attempt_started_at ?? chunk.created_at) <
          90_000
    )
  ) {
    throw new MeetAiError(409, 'Audio is still processing');
  }
  // Compare-and-set prevents concurrent finalizers from generating duplicate bills.
  const attemptStartedAt = new Date().toISOString();
  const claimed = await db
    .from('meet_ai_sessions')
    .update({
      notes_status: 'processing',
      notes_started_at: attemptStartedAt,
    })
    .eq('id', sessionId)
    .in('notes_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimed.error || !claimed.data)
    throw new MeetAiError(409, 'Notes are already processing');
  let providerStarted = false;
  try {
    const ordered = [...chunks].sort((a, b) => a.sequence - b.sequence);
    const incomplete =
      input.captureIncomplete ||
      (input.consentedAccountIds
        ? // The server finalizer has no client count; a gap is the signal.
          ordered.some((chunk, index) => chunk.sequence !== index)
        : input.expectedChunks === undefined ||
          input.expectedChunks !== chunks.length) ||
      chunks.some((chunk) => chunk.status !== 'completed');
    // Consent is applied before anything is read, billed or sent to a model.
    const { chunks: usable, excluded } = input.consentedAccountIds
      ? consentedChunks(chunks, input.consentedAccountIds)
      : { chunks, excluded: 0 };
    // Metadata and missing-audio warnings are not saved speech to bill for.
    const hasSavedSpeech = usable.some((chunk) => {
      const segments = readTranscriptSegments(chunk.usage);
      return segments.length
        ? segments.some((segment) => Boolean(segment.transcript.trim()))
        : Boolean(chunk.transcript?.trim());
    });
    const transcript =
      (incomplete
        ? '[This transcript is incomplete. Audio was lost or capture was interrupted.]\n'
        : '') +
      (excluded
        ? '[Some speakers did not consent to transcription and are omitted.]\n'
        : '') +
      [...usable]
        .sort(
          (a, b) => a.start_seconds - b.start_seconds || a.sequence - b.sequence
        )
        .map((chunk) => formatTranscriptChunk(chunk))
        .join('\n');
    if (transcript.length > 500_000)
      throw new MeetAiError(413, 'Transcript exceeds notes limit');
    providerStarted = hasSavedSpeech;
    const result = hasSavedSpeech
      ? await generateBilledMeetArtifact(
          {
            transcript,
            meetingStartedAt: input.meetingStartedAt,
            timezone: input.timezone,
          },
          {
            userId: input.userId,
            meetingId,
            attemptId: `${sessionId}:${attemptStartedAt}`,
          }
        )
      : null;
    if (result?.notes) {
      const roster = new Map(
        usable.flatMap((chunk) =>
          transcriptSpeakers(chunk.usage).map(
            (speaker) => [speaker.accountId, speaker.displayName] as const
          )
        )
      );
      result.notes.actionItems = result.notes.actionItems.map((item) => ({
        ...item,
        ownerId: item.ownerId && roster.has(item.ownerId) ? item.ownerId : null,
        owner:
          item.ownerId && roster.has(item.ownerId)
            ? roster.get(item.ownerId)!
            : item.owner,
      }));
    }
    // Reuse the settled output; only the idempotent CAS write is retried.
    const payload = {
      notes_status: 'completed',
      notes: {
        ...(result?.notes ?? {
          incomplete: false,
          summary: '',
          decisions: [],
          actionItems: [],
          openQuestions: [],
        }),
        incomplete: !!incomplete,
      } as Json,
      notes_usage: (result?.usage as Json) ?? null,
      notes_cost_usd: result ? result.costUsd : 0,
    };
    const persisted = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const saved = await db
            .from('meet_ai_sessions')
            .update(payload)
            .eq('id', sessionId)
            .eq('notes_started_at', attemptStartedAt)
            .select('id')
            .maybeSingle();
          if (saved.error) throw new MeetAiError(500, 'Could not save notes');
          if (!saved.data)
            throw new MeetAiError(409, 'Notes finalization changed');
        },
        catch: (error) =>
          error instanceof MeetAiError
            ? error
            : new MeetAiError(500, 'Could not save notes'),
      }).pipe(
        Effect.retry({
          times: 2,
          schedule: Schedule.exponential('100 millis'),
          while: (error) => error.status === 500,
        }),
        Effect.either
      )
    );
    if (persisted._tag === 'Left') throw persisted.left;
  } catch (error) {
    await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        notes_unpriced_attempts:
          session.notes_unpriced_attempts + (providerStarted ? 1 : 0),
      })
      .eq('id', sessionId)
      .eq('notes_started_at', attemptStartedAt)
      // An uncertain response must not demote an already committed result.
      .eq('notes_status', 'processing');
    throw error;
  }

  return 'generated';
}
