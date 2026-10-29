import 'server-only';
import { MEET_AUDIO_REQUEST_MAX_BYTES } from '@tuturuuu/ai/meetings/audio-contract';
import { Effect, Either, Schedule } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import { generateBilledMeetArtifact } from './artifact-billing';
import { readAudioParts } from './audio-input';
import { readMeetAudioForm } from './body';
import {
  consentedSourceIndexes,
  hasExtraHostTracks,
  hasHostSharedAudio,
  MEET_HOST_SHARED_AUDIO_MAX_ADMITTED,
  needsConsentRecords,
} from './consent-gate';
import { readMeetConsentRecords } from './consent-records';
import { admitMeetCredits } from './credit-admission';
import {
  readTranscriptionAudience,
  resolveTranscriptSpeaker,
} from './transcript-speaker';

const schema = z.object({
  language: z.enum(['auto', 'vi', 'en', 'vi+en']).default('auto'),
  glossary: z.string().max(800).optional(),
  context: z.string().max(400).optional(),
  sessionId: z.uuid(),
  id: z.uuid(),
  sequence: z.coerce.number().int().min(0).max(1080),
  startSeconds: z.coerce.number().min(0).max(16_200),
});

export async function transcribeMeetChunk(
  request: Request,
  params: MeetAiParams
) {
  const { db, meetingId, user } = await meetAiAccess(request, params, true);
  const batched = request.headers.get('x-meet-audio-batch') === '1';
  const maxBytes = batched ? MEET_AUDIO_REQUEST_MAX_BYTES : 500_000;
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes)
    throw new MeetAiError(413, 'Audio too large');
  const body = await readMeetAudioForm(request, maxBytes);
  const parsed = schema.safeParse(Object.fromEntries(body));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid audio');
  const hints = {
    language: parsed.data.language,
    glossary: parsed.data.glossary,
    context: parsed.data.context,
  };
  const received = await readAudioParts(body, batched);
  const { sessionId, id, sequence, startSeconds } = parsed.data;
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  const existing = await db
    .from('meet_ai_chunks')
    .select('*')
    .eq('session_id', sessionId)
    .eq('sequence', sequence)
    .maybeSingle();
  if (existing.error) throw new MeetAiError(500, 'Chunk lookup failed');
  if (existing.data?.status === 'completed') return existing.data;
  if (
    session.ended_at ||
    Date.now() - Date.parse(session.created_at) > 3 * 60 * 60 * 1000
  )
    throw new MeetAiError(409, 'Transcription has ended');
  // Consent is enforced here, not only in the client: other speakers' audio
  // never reaches the provider without a current allow record.
  if (hasExtraHostTracks(user.id, received))
    throw new MeetAiError(
      400,
      'Too many host audio tracks',
      'MEET_AI_HOST_TRACKS'
    );
  // Host screen audio can carry other people's voices; with anyone else in the
  // room it is excluded (an unknown audience counts as someone else).
  const audience = hasHostSharedAudio(user.id, received)
    ? await readTranscriptionAudience(meetingId, user.id)
    : null;
  const kept = consentedSourceIndexes({
    actorId: user.id,
    sessionStartedAt: session.created_at,
    sources: received,
    records: needsConsentRecords(user.id, received)
      ? await readMeetConsentRecords(db, sessionId)
      : [],
    excludeHostSharedAudio:
      audience === null || audience > MEET_HOST_SHARED_AUDIO_MAX_ADMITTED,
  });
  if (!kept.length)
    throw new MeetAiError(
      403,
      'Transcription consent is required',
      'MEET_AI_CONSENT_REQUIRED'
    );
  const parts = kept.map((index) => received[index]!);
  const excludedSources = received.length - parts.length;
  // A credit refusal must reject the upload before it can leave a failed row.
  const admission = await admitMeetCredits(user.id);
  const resolved = await Effect.runPromise(
    Effect.either(
      Effect.forEach(
        parts,
        (part) =>
          Effect.tryPromise({
            try: () =>
              resolveTranscriptSpeaker({
                db,
                meetingId,
                actorId: user.id,
                accountId: part.speakerAccountId,
                kind: part.sourceKind,
              }),
            catch: (error) => error,
          }),
        { concurrency: 4 }
      )
    )
  );
  if (Either.isLeft(resolved)) throw resolved.left;
  const speakers = resolved.right;
  // Claim one provider attempt at a time, including recovery of failed attempts.
  const reservationStarted = performance.now();
  const inserted = await db.rpc('reserve_meet_ai_chunk', {
    p_id: id,
    p_session_id: sessionId,
    p_sequence: sequence,
    p_start_seconds: startSeconds,
    p_duration_seconds: Math.max(...parts.map((part) => part.durationSeconds)),
  });
  if (inserted.error)
    throw new MeetAiError(
      ['P0001', '23505'].includes(inserted.error.code) ? 409 : 500,
      'Chunk cannot be submitted'
    );
  if (!inserted.data?.id) {
    const duplicate = await db
      .from('meet_ai_chunks')
      .select('*')
      .eq('session_id', sessionId)
      .eq('sequence', sequence)
      .single();
    if (duplicate.error) throw new MeetAiError(500, 'Chunk lookup failed');
    const exhausted =
      duplicate.data.attempts >= 5 &&
      (duplicate.data.status === 'failed' ||
        (duplicate.data.status === 'processing' &&
          Date.now() - Date.parse(duplicate.data.attempt_started_at) >=
            90_000));
    if (exhausted)
      throw new MeetAiError(409, 'Transcription retries exhausted');
    return duplicate.data;
  }
  try {
    const current = await db
      .from('meet_ai_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (current.error) throw new MeetAiError(500, 'Session lookup failed');
    if (
      !current.data ||
      current.data.ended_at ||
      performance.now() - reservationStarted > 30_000
    )
      throw new MeetAiError(
        409,
        'Transcription has ended or reservation expired'
      );
    const result = await generateBilledMeetArtifact(
      batched
        ? { audioSegments: parts.map((part) => part.bytes), hints }
        : { audio: parts[0]!.bytes, hints },
      { userId: user.id, meetingId, attemptId: inserted.data.attempt_id ?? id },
      admission
    );
    const segments = batched
      ? parts.map((part, index) => ({
          speaker: speakers[index] ?? null,
          kind: part.sourceKind ?? 'microphone',
          startSeconds: part.startSeconds,
          transcript: result.transcripts?.[index] ?? '',
        }))
      : null;
    if (batched && result.transcripts?.length !== parts.length)
      throw new MeetAiError(502, 'Incomplete transcription result');
    const transcript = segments
      ? segments.map((segment) => segment.transcript).join('\n')
      : result.text;
    const speaker = speakers[0];
    // Preserve the settled provider output across persistence-only retries.
    const payload = {
      status: 'completed',
      transcript,
      usage: {
        ...result.usage,
        ...(excludedSources ? { excludedSources } : {}),
        ...(segments ? { segments } : speaker ? { speaker } : {}),
      },
      cost_usd: result.costUsd,
    };
    const persisted = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          let write = db.from('meet_ai_chunks').update(payload).eq('id', id);
          if (inserted.data.attempt_id)
            write = write.eq('attempt_id', inserted.data.attempt_id);
          const saved = await write.select('*').maybeSingle();
          if (saved.error)
            throw new MeetAiError(500, 'Could not save transcript');
          if (!saved.data)
            throw new MeetAiError(409, 'Transcription attempt changed');
          return saved.data;
        },
        catch: (error) =>
          error instanceof MeetAiError
            ? error
            : new MeetAiError(500, 'Could not save transcript'),
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
    return persisted.right;
  } catch (error) {
    let failure = db
      .from('meet_ai_chunks')
      .update({ status: 'failed' })
      .eq('id', id)
      .eq('status', 'processing');
    if (inserted.data.attempt_id)
      failure = failure.eq('attempt_id', inserted.data.attempt_id);
    await failure;
    throw error;
  }
}
