import 'server-only';
import { generateMeetArtifact } from '@tuturuuu/ai/meetings/gemini';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import { readMeetAudioForm } from './body';

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
  // The capture client emits canonical mono PCM WAV at 16 kHz, <= 15 seconds.
  if (Number(request.headers.get('content-length') ?? 0) > 500_000)
    throw new MeetAiError(413, 'Audio too large');
  const body = await readMeetAudioForm(request);
  const parsed = schema.safeParse(Object.fromEntries(body));
  const audio = body.get('audio');
  if (
    !parsed.success ||
    !(audio instanceof File) ||
    audio.size <= 44 ||
    audio.size > 480_044
  )
    throw new MeetAiError(400, 'Invalid audio');
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + size));
  if (
    ascii(0, 4) !== 'RIFF' ||
    ascii(8, 8) !== 'WAVEfmt ' ||
    ascii(36, 4) !== 'data' ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 16000 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2 !== 0
  )
    throw new MeetAiError(400, 'Invalid PCM audio');
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
  // Claim one provider attempt at a time, including recovery of failed attempts.
  const reservationStarted = performance.now();
  const inserted = await db.rpc('reserve_meet_ai_chunk', {
    p_id: id,
    p_session_id: sessionId,
    p_sequence: sequence,
    p_start_seconds: startSeconds,
    p_duration_seconds: (bytes.length - 44) / 32000,
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
    const result = await generateMeetArtifact({ audio: bytes });
    const save = () => {
      let write = db
        .from('meet_ai_chunks')
        .update({
          status: 'completed',
          transcript: result.text,
          usage: result.usage,
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
      .eq('id', id);
    if (inserted.data.attempt_id)
      failure = failure.eq('attempt_id', inserted.data.attempt_id);
    await failure;
    throw error;
  }
}
