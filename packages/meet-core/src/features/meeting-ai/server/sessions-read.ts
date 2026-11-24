import {
  readTranscriptChunk,
  resolveTranscriptActionOwners,
} from '@tuturuuu/ai/meetings/transcript';
import 'server-only';
import { meetNotesSchema } from '@tuturuuu/ai/meetings/gemini';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import type { MeetAiState } from '@tuturuuu/internal-api';
import { MEETING_APP } from '../../../runtime';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';
import { meetingProviderTransport } from './provider-transport';
import { readTranscriptRoster } from './transcript-roster';
import { readMeetTranscriptionAvailability } from './transcription-availability';

/** The room-capture session read: legacy sessions and their chunks only. */
export async function readMeetAi(request: Request, params: MeetAiParams) {
  const { db, meetingId, wsId, canManage } = await meetAiAccess(
    request,
    params
  );
  const { data: rows, error } = await db
    .from('meet_ai_sessions')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at')
    .range(0, 999);
  if (error) throw new MeetAiError(503, 'Meeting AI storage is not ready');
  // Room capture reads only its own sessions; self_v1 has its own contracts.
  const sessions = rows.filter(
    (session) => (session.protocol ?? 'legacy') === 'legacy'
  );
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
  const roster = await readTranscriptRoster(db, chunks);
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
  const sessionOrder = new Map<string, number>(
    ids.map((id: string, index: number) => [id, index])
  );
  chunks.sort(
    (a, b) =>
      (sessionOrder.get(a.session_id) ?? 0) -
        (sessionOrder.get(b.session_id) ?? 0) ||
      a.start_seconds - b.start_seconds ||
      a.sequence - b.sequence
  );
  const availability = await readMeetTranscriptionAvailability(wsId).catch(
    () => ({ available: false as const, reason: 'error' as const })
  );
  return {
    available: availability.available,
    unavailableReason: availability.available ? undefined : availability.reason,
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
        session.notes === null
          ? null
          : (() => {
              const notes = meetNotesSchema.parse(session.notes);
              return {
                ...notes,
                actionItems: resolveTranscriptActionOwners(
                  notes.actionItems,
                  roster
                ),
              };
            })(),
    })),
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      sequence: chunk.sequence,
      start_seconds: chunk.start_seconds,
      duration_seconds: chunk.duration_seconds,
      ...readTranscriptChunk(chunk, roster),
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
