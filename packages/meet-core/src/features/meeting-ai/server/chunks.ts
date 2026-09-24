import 'server-only';
import { MEET_AUDIO_REQUEST_MAX_BYTES } from '@tuturuuu/ai/meetings/audio-contract';
import { Effect, Either } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import { generateBilledMeetArtifact } from './artifact-billing';
import { readAudioParts } from './audio-input';
import { readMeetAudioForm } from './body';
import { resolveTranscriptSpeaker } from './transcript-speaker';

const schema = z.object({
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
  const parts = await readAudioParts(body, batched);
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
        ? { audioSegments: parts.map((part) => part.bytes) }
        : { audio: parts[0]!.bytes },
      { userId: user.id, meetingId, attemptId: inserted.data.attempt_id ?? id }
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
    const save = () => {
      let write = db
        .from('meet_ai_chunks')
        .update({
          status: 'completed',
          transcript,
          usage: {
            ...result.usage,
            ...(segments ? { segments } : speaker ? { speaker } : {}),
          },
          cost_usd: result.costUsd,
        })
        .eq('id', id);
      if (inserted.data.attempt_id)
        write = write.eq('attempt_id', inserted.data.attempt_id);
      return write.select('*').single();
    };
    // Retry persistence, never the billable provider request.
    let saved = await save();
    if (saved.error) saved = await save();
    if (saved.error) throw new MeetAiError(500, 'Could not save transcript');
    return saved.data;
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
