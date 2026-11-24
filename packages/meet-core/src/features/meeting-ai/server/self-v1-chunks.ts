import 'server-only';
import { MEET_AI_PRICING } from '@tuturuuu/ai/meetings/usage';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { MeetAiError, type MeetAiParams } from './access';
import { generateBilledMeetArtifact } from './artifact-billing';
import { admitMeetCredits } from './credit-admission';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import { loadSelfSession, meetSelfAccess } from './self-v1-access';
import { readSelfChunkAudio, readSelfChunkFields } from './self-v1-audio';
import { drainSelfOutbox } from './self-v1-outbox';
import { type MeetSelfRoom, selfRoom, selfRoomCommands } from './self-v1-room';
import {
  type MeetAiChunkRow,
  MeetSelfRpcError,
  selfRpc,
} from './self-v1-rpc';
import { requireMeetTranscriptPayer } from './transcript-authority';
import { enforceMeetAiUsage } from './usage-limit';

/** Each chunk is charged at least 5 audio seconds by the limiter. */
export const MEET_SELF_MIN_CHARGE_SECONDS = 5;
const MAX_OUTPUT_TOKENS = 8192;
const LANGUAGES = new Set(['auto', 'vi', 'en', 'vi+en']);

/** The most a chunk can cost: audio tokens plus fixed instructions and full output. */
export function maxSelfChunkCostUsd(audioSeconds: number) {
  const input = Math.ceil(audioSeconds * 100) + 2048;
  return (
    (input * MEET_AI_PRICING.audio + MAX_OUTPUT_TOKENS * MEET_AI_PRICING.output) /
    1_000_000
  );
}

const consentRefused = () =>
  new MeetAiError(
    409,
    'Transcription of your voice is off',
    'MEET_TRANSCRIPT_CONSENT_REQUIRED'
  );

function project(chunk: MeetAiChunkRow) {
  return {
    id: chunk.id,
    sessionId: chunk.session_id,
    streamId: chunk.stream_id,
    sequence: chunk.sequence,
    startMs: chunk.start_ms,
    endMs: chunk.end_ms,
    status: chunk.status,
    // The uploader only ever sees their own completed text.
    transcript: chunk.status === 'completed' ? chunk.transcript : null,
  };
}

/**
 * Session time of a chunk: the uploader's own stream opened at a known
 * offset from the session start, and `startSample` counts 16 kHz samples
 * from that open. The stream must be this account's stream in this session.
 */
async function sessionStartMs(
  db: TypedSupabaseClient,
  input: {
    session: { id: string; created_at: string };
    streamId: string;
    accountId: string;
    startSample: number;
  }
) {
  const { data: stream, error } = await db
    .schema('private')
    .from('meet_ai_capture_streams')
    .select('created_at')
    .eq('id', input.streamId)
    .eq('session_id', input.session.id)
    .eq('account_id', input.accountId)
    .maybeSingle();
  if (error) throw new MeetAiError(503, 'Capture stream lookup failed');
  if (!stream) throw consentRefused();
  const offset = Math.max(
    0,
    Date.parse(stream.created_at) - Date.parse(input.session.created_at)
  );
  return Math.round(offset) + Math.floor(input.startSample / 16);
}

/** Room authority for this uploader; pending legal entries are written first. */
async function roomCheck(
  db: TypedSupabaseClient,
  room: MeetSelfRoom,
  input: {
    sessionId: string;
    streamId: string;
    consentRevision: number;
    spend: boolean;
  }
) {
  const reply = await selfRoomCommands.authorize(room, input);
  await drainSelfOutbox(db, room, input.sessionId, reply.pending);
  return reply;
}

async function settleQuietly(
  db: TypedSupabaseClient,
  input: Parameters<typeof selfRpc.settleChunk>[1]
) {
  try {
    return await selfRpc.settleChunk(db, input);
  } catch {
    console.warn('[meet-ai] self_v1 chunk settlement pending', {
      outcome: input.outcome,
    });
    return null;
  }
}

/**
 * One participant's own processed microphone chunk for a self_v1 session.
 * Order: uploader access, strict fields, session by id and meeting, room
 * authority (spends the account's token), canonical WAV, the usage limiter,
 * the host payer and credits, then the cost and chunk reservation. Dispatch
 * re-checks the flag, commits the dispatch revision and re-runs the room
 * check; after the provider returns, the room and the legal record are read
 * again and any change discards the text.
 */
export async function transcribeSelfChunk(
  request: Request,
  params: MeetAiParams,
  form: FormData
) {
  const { db, user, wsId, meetingId } = await meetSelfAccess(request, params);
  const fields = readSelfChunkFields(request, form);
  const session = await loadSelfSession(
    db,
    { sessionId: fields.sessionId, meetingId, wsId },
    'upload'
  );
  const room = await selfRoom(meetingId, user.id);
  const fence = {
    sessionId: session.id,
    streamId: fields.streamId,
    consentRevision: fields.consentRevision,
  };
  const admit = await roomCheck(db, room, { ...fence, spend: true });
  if (!admit.allowed)
    throw admit.reason === 'rate_limited'
      ? new MeetAiError(
          429,
          'Too many audio uploads; try again shortly',
          'MEET_SELF_RATE_LIMITED',
          10
        )
      : consentRefused();
  const audio = await readSelfChunkAudio(form);
  await enforceMeetAiUsage({
    kind: 'chunk',
    userId: user.id,
    meetingId,
    workspaceId: wsId,
    audioSeconds: Math.max(audio.durationSeconds, MEET_SELF_MIN_CHARGE_SECONDS),
  });
  // Billing starts from the session's host pair, never the uploader.
  const hostId = session.billing_host_id;
  const { billingWorkspaceId } = await requireMeetTranscriptPayer({
    userId: hostId,
    wsId: session.billing_ws_id ?? wsId,
    meetingId,
  });
  const admission = await admitMeetCredits(
    hostId,
    meetingId,
    billingWorkspaceId
  );
  const startMs = await sessionStartMs(db, {
    session,
    streamId: fields.streamId,
    accountId: user.id,
    startSample: fields.startSample,
  });
  const chunk = await selfRpc.reserveChunk(db, {
    id: fields.id,
    sessionId: session.id,
    streamId: fields.streamId,
    accountId: user.id,
    sequence: fields.sequence,
    startSample: fields.startSample,
    startMs,
    endMs: startMs + audio.durationMs,
    digestHex: audio.digestHex,
    consentRevision: fields.consentRevision,
    audioSeconds: audio.durationSeconds,
    maxCostUsd: maxSelfChunkCostUsd(audio.durationSeconds),
  });
  // An exact duplicate that already left reservation is never re-armed.
  if (
    chunk.status !== 'processing' ||
    chunk.reservation_state !== 'reserved' ||
    chunk.dispatch_consent_revision !== null
  )
    return project(chunk);
  const language = LANGUAGES.has(session.language_hint ?? '')
    ? (session.language_hint as 'auto' | 'vi' | 'en' | 'vi+en')
    : 'auto';
  let hookEntered = false;
  let marked = false;
  let dispatched = false;
  let result: Awaited<ReturnType<typeof generateBilledMeetArtifact>>;
  try {
    result = await generateBilledMeetArtifact(
      { audio: audio.wav, hints: { language } },
      { userId: hostId, meetingId, attemptId: chunk.id },
      admission,
      {
        beforeProvider: async () => {
          hookEntered = true;
          if (!(await meetPerSpeakerEnabled(wsId)))
            throw new MeetAiError(
              403,
              'Transcription of your voice is not available',
              'MEET_SELF_UNAVAILABLE'
            );
          await selfRpc.markDispatch(db, {
            chunkId: chunk.id,
            accountId: user.id,
            consentRevision: fields.consentRevision,
          });
          marked = true;
          const recheck = await roomCheck(db, room, { ...fence, spend: false });
          if (!recheck.allowed) throw consentRefused();
          dispatched = true;
        },
      }
    );
  } catch (error) {
    if (dispatched)
      // A provider error, timeout or missing usage after dispatch keeps the
      // full reservation as unknown cost against the session cap.
      await settleQuietly(db, { chunkId: chunk.id, outcome: 'unknown' });
    else if (marked)
      // Committed for dispatch but never sent: settled at zero cost.
      await settleQuietly(db, {
        chunkId: chunk.id,
        outcome: 'discarded',
        costUsd: 0,
      });
    else if (hookEntered)
      await settleQuietly(db, { chunkId: chunk.id, outcome: 'released' });
    throw error;
  }
  return persistSelfChunk(db, room, {
    chunkId: chunk.id,
    accountId: user.id,
    fence,
    result,
  });
}

async function persistSelfChunk(
  db: TypedSupabaseClient,
  room: MeetSelfRoom,
  input: {
    chunkId: string;
    accountId: string;
    fence: { sessionId: string; streamId: string; consentRevision: number };
    result: Awaited<ReturnType<typeof generateBilledMeetArtifact>>;
  }
) {
  const { result, fence } = input;
  const costUsd = result.costUsd ?? 0;
  const usage = {
    model: result.usage.model,
    inputTokens: result.usage.inputTokens ?? null,
    outputTokens: result.usage.outputTokens ?? null,
  } as Json;
  let allowed = false;
  try {
    const after = await roomCheck(db, room, { ...fence, spend: false });
    const consent = await selfRpc.consentState(db, {
      sessionId: fence.sessionId,
      accountId: input.accountId,
    });
    allowed =
      after.allowed &&
      consent?.decision === 'allow' &&
      consent.revision === fence.consentRevision;
  } catch {
    allowed = false;
  }
  const discard = async () => {
    const saved = await selfRpc.settleChunk(db, {
      chunkId: input.chunkId,
      outcome: 'discarded',
      usage,
      costUsd,
    });
    return project(saved);
  };
  // Text from a withdrawn or ended speaker is never stored or returned.
  if (!allowed) return discard();
  const saved = await Effect.runPromise(
    Effect.tryPromise({
      try: () =>
        selfRpc.settleChunk(db, {
          chunkId: input.chunkId,
          outcome: 'completed',
          transcript: result.text ?? '',
          usage,
          costUsd,
        }),
      catch: (error) =>
        error instanceof MeetAiError
          ? error
          : new MeetAiError(500, 'Could not save transcript'),
    }).pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential('100 millis'),
        while: (error) => error.status >= 500,
      }),
      Effect.either
    )
  );
  if (saved._tag === 'Right') return project(saved.right);
  // The database refuses completed text under a changed consent revision.
  if (saved.left instanceof MeetSelfRpcError && saved.left.pgCode === '55000')
    return discard();
  throw saved.left;
}
