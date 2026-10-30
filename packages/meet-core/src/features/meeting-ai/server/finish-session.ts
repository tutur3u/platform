import {
  formatTranscriptChunk,
  readTranscriptSegments,
  transcriptSpeakers,
} from '@tuturuuu/ai/meetings/transcript';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { generateBilledMeetArtifact, settleMeetRun } from './artifact-billing';
import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json, Tables } from '@tuturuuu/types';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import { MeetAiError } from './access';
import { consentedChunks } from './consent-filter';
import {
  BILLING_UNRECONCILED,
  isSettledUncharged,
  notesCheckpointUsage,
  readNotesCheckpoint,
} from './notes-billing';

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
  /**
   * Unattended caller. Its billing identity is stable per session, so the
   * ledger refuses a second run after an unknown billed outcome. A human click
   * uses a fresh identity and is the way to reconcile.
   */
  automatic?: boolean;
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
        // An unattended retry keeps its billing identity: a crash may have
        // followed a charge, and only the ledger can say.
        notes_unpriced_attempts:
          session.notes_unpriced_attempts + (input.automatic ? 0 : 1),
      })
      .eq('id', sessionId)
      .eq('notes_status', 'processing')
      .eq('notes_started_at', session.notes_started_at)
      .select('id')
      .maybeSingle();
    if (recovered.error || !recovered.data)
      throw new MeetAiError(409, 'Notes are still processing');
    if (!input.automatic) session.notes_unpriced_attempts++;
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
  // Set once output exists or the billed outcome is unknown; see the catch block.
  let fenced = false;
  // Reuse the settled output; only the idempotent CAS write is retried.
  const save = async (payload: {
    notes_status: string;
    notes: Json;
    notes_usage: Json;
    notes_cost_usd: number | null;
  }) => {
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
  };
  try {
    const kept = readNotesCheckpoint(session.notes_usage);
    if (kept) {
      // An earlier delivery generated and kept the output. Settle its run again
      // (idempotent) and commit: no provider call, no new run, no second charge.
      fenced = true;
      await settleMeetRun(kept.settlement);
      await save({
        notes_status: 'completed',
        notes: kept.notes as Json,
        notes_usage: kept.usage as Json,
        notes_cost_usd: kept.costUsd,
      });
      return 'generated';
    }
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
    const build = (
      generated: Awaited<ReturnType<typeof generateBilledMeetArtifact>> | null
    ) => {
      const roster = new Map<string, string>(
        usable.flatMap((chunk) =>
          transcriptSpeakers(chunk.usage).map(
            (speaker) => [speaker.accountId, speaker.displayName] as const
          )
        )
      );
      const notes = generated?.notes && {
        ...generated.notes,
        actionItems: generated.notes.actionItems.map((item) => ({
          ...item,
          ownerId:
            item.ownerId && roster.has(item.ownerId) ? item.ownerId : null,
          owner:
            item.ownerId && roster.has(item.ownerId)
              ? roster.get(item.ownerId)!
              : item.owner,
        })),
      };
      return {
        notes_status: 'completed',
        notes: {
          ...(notes ?? {
            incomplete: false,
            summary: '',
            decisions: [],
            actionItems: [],
            openQuestions: [],
          }),
          incomplete: !!incomplete,
        } as Json,
        notes_usage: (generated?.usage as Json) ?? null,
        notes_cost_usd: generated ? generated.costUsd : 0,
      };
    };
    const generationId = input.automatic
      ? `${sessionId}:g${session.notes_unpriced_attempts}`
      : `${sessionId}:${attemptStartedAt}`;
    let result: Awaited<ReturnType<typeof generateBilledMeetArtifact>> | null =
      null;
    if (hasSavedSpeech) {
      try {
        result = await generateBilledMeetArtifact(
          {
            transcript,
            meetingStartedAt: input.meetingStartedAt ?? undefined,
            timezone: input.timezone,
          },
          { userId: input.userId, meetingId, attemptId: generationId },
          undefined,
          {
            // Keep the output and the run reference before the charge settles,
            // so a failed save is recovered instead of generated and billed again.
            onGenerated: async ({ measured, settlement }) => {
              fenced = true;
              // Notes generation returns the notes shape; the hook is shared with transcription.
              const built = build(
                measured as unknown as Parameters<typeof build>[0]
              );
              const kept = await db
                .from('meet_ai_sessions')
                .update({
                  notes_usage: notesCheckpointUsage({
                    notes: built.notes as Record<string, unknown>,
                    usage: built.notes_usage,
                    costUsd: built.notes_cost_usd,
                    settlement,
                  }),
                })
                .eq('id', sessionId)
                .eq('notes_started_at', attemptStartedAt)
                .eq('notes_status', 'processing')
                .select('id')
                .maybeSingle();
              if (kept.error || !kept.data)
                throw new MeetAiError(
                  503,
                  'Could not keep generated notes',
                  BILLING_UNRECONCILED
                );
            },
          }
        );
      } catch (error) {
        // The ledger already holds a run for this identity: its billed outcome
        // is unknown to us, so nothing may generate again until it is reconciled.
        if (error instanceof AiStudioError && error.status === 409) {
          fenced = true;
          throw new MeetAiError(
            409,
            'Notes generation needs reconciliation',
            BILLING_UNRECONCILED
          );
        }
        throw error;
      }
    }
    const payload = build(result);
    await save(payload);
  } catch (error) {
    await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        // An unattended identity rotates only after a failure the ledger settled
        // as failed. Output, an unknown billed outcome or a lost settlement keeps
        // it, so the ledger decides whether anything may run again. A human click
        // already uses a fresh identity, so it keeps the plain failure count.
        notes_unpriced_attempts:
          session.notes_unpriced_attempts +
          (input.automatic
            ? isSettledUncharged(error)
              ? 1
              : 0
            : providerStarted &&
                !fenced &&
                !(
                  error instanceof MeetAiError &&
                  error.code === BILLING_UNRECONCILED
                )
              ? 1
              : 0),
      })
      .eq('id', sessionId)
      .eq('notes_started_at', attemptStartedAt)
      // An uncertain response must not demote an already committed result.
      .eq('notes_status', 'processing');
    throw error;
  }

  return 'generated';
}
