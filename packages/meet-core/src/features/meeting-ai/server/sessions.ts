import {
  readTranscriptSegments,
  readTranscriptSpeaker,
} from '@tuturuuu/ai/meetings/transcript';
import { MEETING_APP } from '../../../runtime';
import { finishMeetAiSession } from './finish-session';
import { meetingProviderTransport } from './provider-transport';
import { readMeetingRoomPolicy } from './room-access';
import 'server-only';
import { meetNotesSchema } from '@tuturuuu/ai/meetings/gemini';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import type { MeetAiState } from '@tuturuuu/internal-api';
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
  let estimatedCostUsd = chunks.reduce(
      (sum, chunk) => sum + (chunk.prior_cost_usd ?? 0),
      0
    ),
    unpricedRequests = 0,
    inputTokens = 0,
    outputTokens = 0;
  for (const row of [
    ...chunks.map((chunk) => ({
      cost: chunk.cost_usd,
      usage: chunk.usage,
      done:
        chunk.status !== 'processing' ||
        Date.now() - Date.parse(chunk.attempt_started_at ?? chunk.created_at) >
          90_000,
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
  unpricedRequests += chunks.reduce(
    (sum, chunk) => sum + (chunk.unpriced_attempts ?? 0),
    0
  );
  unpricedRequests += sessions.reduce(
    (sum, session) => sum + session.notes_unpriced_attempts,
    0
  );
  const sessionOrder = new Map(ids.map((id, index) => [id, index]));
  chunks.sort(
    (a, b) =>
      (sessionOrder.get(a.session_id) ?? 0) -
        (sessionOrder.get(b.session_id) ?? 0) ||
      a.start_seconds - b.start_seconds ||
      a.sequence - b.sequence
  );
  return {
    configured:
      MEETING_APP === 'parley'
        ? await meetingProviderTransport().then(
            () => true,
            () => false
          )
        : !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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
      speaker: readTranscriptSpeaker(chunk.usage),
      segments: readTranscriptSegments(chunk.usage),
      cost_usd: canManage ? chunk.cost_usd : null,
      status:
        chunk.status === 'processing' &&
        Date.now() - Date.parse(chunk.attempt_started_at ?? chunk.created_at) >
          90_000
          ? 'failed'
          : chunk.status,
    })),
    transcriptionCostUsd: canManage
      ? chunks.reduce(
          (sum, chunk) =>
            sum + (chunk.cost_usd ?? 0) + (chunk.prior_cost_usd ?? 0),
          0
        )
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
  timezone: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
  action: z.enum(['start', 'finish', 'sharing']),
  shareNotes: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
  sessionId: z.uuid().optional(),
  expectedChunks: z.number().int().min(0).max(1080).optional(),
  captureIncomplete: z.boolean().optional(),
});
export async function changeMeetAi(request: Request, params: MeetAiParams) {
  const { db, meetingId, wsId, user, meetingStartedAt } = await meetAiAccess(
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
  if (MEETING_APP !== 'parley' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
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
  await finishMeetAiSession({
    db,
    session,
    userId: user.id,
    meetingId,
    meetingStartedAt,
    timezone: parsed.data.timezone,
    expectedChunks: parsed.data.expectedChunks,
    captureIncomplete: parsed.data.captureIncomplete,
  });
  return { sessionId };
}
