import { readMeetingRoomPolicy } from './room-access';
import 'server-only';
import {
  generateMeetArtifact,
  meetNotesSchema,
} from '@tuturuuu/ai/meetings/gemini';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import type { MeetAiState } from '@tuturuuu/internal-api';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';

export async function readMeetAi(request: Request, params: MeetAiParams) {
  const { db, meetingId, canManage } = await meetAiAccess(request, params);
  const { data: sessions, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at')
    .range(0, 999);
  if (error) throw new MeetAiError(503, 'Meeting AI storage is not ready');
  const ids = sessions.map((session) => session.id);
  const chunks = [];
  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      const page = await db
        .from('meet_ai_chunks')
        .select('*')
        .in('session_id', ids)
        .order('created_at')
        .order('id')
        .range(offset, offset + 999);
      if (page.error) throw new MeetAiError(500, 'Transcript lookup failed');
      chunks.push(...page.data);
      if (page.data.length < 1000) break;
      if (offset >= 19_000)
        throw new MeetAiError(413, 'Meeting transcript exceeds display limit');
    }
  }
  let estimatedCostUsd = 0,
    unpricedRequests = 0,
    inputTokens = 0,
    outputTokens = 0;
  for (const row of [
    ...chunks.map((chunk) => ({
      cost: chunk.cost_usd,
      usage: chunk.usage,
      done:
        chunk.status !== 'processing' ||
        Date.now() - Date.parse(chunk.created_at) > 90_000,
    })),
    ...sessions.map((session) => ({
      cost: session.notes_cost_usd,
      usage: session.notes_usage,
      done: session.notes_status === 'completed',
    })),
  ]) {
    if (!row.done) continue;
    if (row.cost === null) unpricedRequests++;
    else estimatedCostUsd += row.cost;
    const usage = row.usage as {
      inputTokens?: number;
      outputTokens?: number;
    } | null;
    inputTokens += usage?.inputTokens ?? 0;
    outputTokens += usage?.outputTokens ?? 0;
  }
  unpricedRequests += sessions.reduce(
    (sum, session) => sum + session.notes_unpriced_attempts,
    0
  );
  return {
    configured: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    canManage,
    sessions: sessions.map((session) => ({
      id: session.id,
      user_id: session.user_id,
      created_at: session.created_at,
      ended_at: session.ended_at,
      notes_started_at: session.notes_started_at,
      notes_status: session.notes_status,
      notes_cost_usd: canManage ? session.notes_cost_usd : null,
      notes:
        session.notes === null ? null : meetNotesSchema.parse(session.notes),
    })),
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      sequence: chunk.sequence,
      start_seconds: chunk.start_seconds,
      duration_seconds: chunk.duration_seconds,
      transcript: chunk.transcript,
      cost_usd: canManage ? chunk.cost_usd : null,
      status:
        chunk.status === 'processing' &&
        Date.now() - Date.parse(chunk.created_at) > 90_000
          ? 'failed'
          : chunk.status,
    })),
    transcriptionCostUsd: canManage
      ? chunks.reduce((sum, chunk) => sum + (chunk.cost_usd ?? 0), 0)
      : null,
    notesCostUsd: canManage
      ? sessions.reduce(
          (sum, session) => sum + (session.notes_cost_usd ?? 0),
          0
        )
      : null,
    model: MEET_AI_MODEL,
    estimatedCostUsd: canManage ? estimatedCostUsd : null,
    unpricedRequests: canManage ? unpricedRequests : null,
    inputTokens: canManage ? inputTokens : null,
    outputTokens: canManage ? outputTokens : null,
  } satisfies MeetAiState;
}

const actionSchema = z.object({
  action: z.enum(['start', 'finish', 'sharing']),
  shareNotes: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
  sessionId: z.uuid().optional(),
  expectedChunks: z.number().int().min(0).max(1080).optional(),
  captureIncomplete: z.boolean().optional(),
});
export async function changeMeetAi(request: Request, params: MeetAiParams) {
  const { db, meetingId, wsId, user } = await meetAiAccess(
    request,
    params,
    true
  );
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid request');
  if (parsed.data.action === 'sharing') {
    await readMeetingRoomPolicy(
      { meetingId, wsId, userId: user.id, isHost: true },
      {
        shareNotes: parsed.data.shareNotes,
        shareNotesAfterMeeting: parsed.data.shareNotesAfterMeeting,
      }
    );
    return { updated: true };
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    throw new MeetAiError(503, 'Meeting AI is not configured');
  const { action, sessionId } = parsed.data;
  if (action === 'start') {
    const { data, error } = await db
      .from('meet_ai_sessions')
      .insert({ meeting_id: meetingId, user_id: user.id })
      .select('id')
      .single();
    if (error)
      throw new MeetAiError(
        error.code === '23505' ? 409 : 500,
        'Could not start transcription'
      );
    return { sessionId: data.id };
  }
  if (!sessionId) throw new MeetAiError(400, 'Missing session');
  const { data: session, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!session) throw new MeetAiError(404, 'Session not found');
  if (session.notes_status === 'completed') return { sessionId };
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
        Date.now() - Date.parse(chunk.created_at) < 90_000
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
    const incomplete =
      parsed.data.captureIncomplete ||
      parsed.data.expectedChunks === undefined ||
      parsed.data.expectedChunks !== chunks.length ||
      chunks.some((chunk) => chunk.status !== 'completed');
    const transcript =
      (incomplete
        ? '[This transcript is incomplete. Audio was lost or capture was interrupted.]\n'
        : '') +
      chunks
        .map(
          (chunk) =>
            `[${chunk.start_seconds}s] ${chunk.transcript ?? '[Missing audio segment]'}`
        )
        .join('\n');
    if (transcript.length > 500_000)
      throw new MeetAiError(413, 'Transcript exceeds notes limit');
    providerStarted = !!transcript.trim();
    const result = transcript.trim()
      ? await generateMeetArtifact({ transcript })
      : null;
    const saved = await db
      .from('meet_ai_sessions')
      .update({
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
      })
      .eq('id', sessionId)
      .eq('notes_started_at', attemptStartedAt)
      .select('id')
      .maybeSingle();
    if (saved.error || !saved.data)
      throw new MeetAiError(500, 'Could not save notes');
  } catch (error) {
    await db
      .from('meet_ai_sessions')
      .update({
        notes_status: 'failed',
        notes_unpriced_attempts:
          session.notes_unpriced_attempts + (providerStarted ? 1 : 0),
      })
      .eq('id', sessionId)
      .eq('notes_started_at', attemptStartedAt);
    throw error;
  }
  return { sessionId };
}
