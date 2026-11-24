import 'server-only';
import type { Database, Json } from '@tuturuuu/types';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MeetAiError } from './access';

type PrivateFunctions = Database['private']['Functions'];
type Fn = keyof PrivateFunctions;
export type MeetAiSessionRow =
  Database['public']['Tables']['meet_ai_sessions']['Row'];
export type MeetAiChunkRow =
  Database['public']['Tables']['meet_ai_chunks']['Row'];

/** A refusal from a self_v1 RPC, keeping the Postgres errcode for callers. */
export class MeetSelfRpcError extends MeetAiError {
  constructor(
    status: number,
    message: string,
    public pgCode: string | undefined,
    code?: string
  ) {
    super(status, message, code);
  }
}

/**
 * Errcodes the capture-path RPCs raise. Messages stay generic; database
 * text never reaches the client.
 */
function refusal(pgCode: string | undefined, fallback: string) {
  switch (pgCode) {
    case '22023':
    case '23514':
      return new MeetSelfRpcError(400, 'Invalid capture request', pgCode);
    case '42501':
      return new MeetSelfRpcError(
        403,
        'Only the meeting host can stop',
        pgCode
      );
    case '40001':
      return new MeetSelfRpcError(
        409,
        'Capture state changed',
        pgCode,
        'MEET_SELF_STALE'
      );
    case '54000':
      return new MeetSelfRpcError(
        409,
        'Transcription limit reached',
        pgCode,
        'MEET_SELF_LIMIT_REACHED'
      );
    case '55000':
      return new MeetSelfRpcError(
        409,
        'Transcription is not available for you right now',
        pgCode,
        'MEET_SELF_NOT_ELIGIBLE'
      );
    case 'P0002':
      return new MeetSelfRpcError(404, 'Capture not found', pgCode);
    case '23505':
      return new MeetSelfRpcError(409, 'Chunk already submitted', pgCode);
    default:
      return new MeetSelfRpcError(503, fallback, pgCode);
  }
}

async function call<F extends Fn>(
  db: TypedSupabaseClient,
  fn: F,
  args: PrivateFunctions[F]['Args']
): Promise<PrivateFunctions[F]['Returns']> {
  const rpc = db.schema('private').rpc as unknown as (
    name: string,
    params: unknown
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
  let result: Awaited<ReturnType<typeof rpc>>;
  try {
    result = await rpc.call(db.schema('private'), String(fn), args);
  } catch {
    throw new MeetSelfRpcError(503, 'Transcription storage is unavailable', '');
  }
  if (result.error)
    throw refusal(result.error.code, 'Transcription storage is unavailable');
  return result.data as PrivateFunctions[F]['Returns'];
}

/** Whether `record_decision` takes notice evidence; unknown until tried. */
let evidenceParams: boolean | undefined;

const first = <T>(rows: T | T[] | null | undefined): T | undefined =>
  Array.isArray(rows) ? rows[0] : (rows ?? undefined);

export const selfRpc = {
  startSession: (
    db: TypedSupabaseClient,
    input: { meetingId: string; hostId: string; wsId: string }
  ) =>
    call(db, 'meet_ai_self_v1_start_session', {
      p_meeting_id: input.meetingId,
      p_host_id: input.hostId,
      p_ws_id: input.wsId,
    }) as Promise<MeetAiSessionRow>,

  stopSession: (
    db: TypedSupabaseClient,
    input: { sessionId: string; hostId: string; hard: boolean }
  ) =>
    call(db, 'meet_ai_self_v1_stop_session', {
      p_session_id: input.sessionId,
      p_host_id: input.hostId,
      p_hard: input.hard,
    }) as Promise<MeetAiSessionRow>,

  closeDrained: (db: TypedSupabaseClient, sessionId: string) =>
    call(db, 'meet_ai_self_v1_close_drained', {
      p_session_id: sessionId,
    }) as Promise<MeetAiSessionRow>,

  recordDecision: async (
    db: TypedSupabaseClient,
    input: {
      sessionId: string;
      accountId: string;
      decision: 'allow' | 'deny' | 'withdraw';
      noticeVersion: string;
      roomSeq: number;
      /** Notice evidence for an allow, stored once the database accepts it. */
      evidence?: { locale: string; textHash: string };
    }
  ) => {
    const args = {
      p_session_id: input.sessionId,
      p_account_id: input.accountId,
      p_decision: input.decision,
      p_notice_version: input.noticeVersion,
      p_room_seq: input.roomSeq,
    };
    const send = (withEvidence: boolean) =>
      call(
        db,
        'meet_ai_self_v1_record_decision',
        (withEvidence && input.evidence
          ? {
              ...args,
              p_locale: input.evidence.locale,
              p_text_hash: input.evidence.textHash,
            }
          : args) as PrivateFunctions['meet_ai_self_v1_record_decision']['Args']
      );
    let rows: Awaited<ReturnType<typeof send>>;
    const tryEvidence = !!input.evidence && evidenceParams !== false;
    try {
      rows = await send(tryEvidence);
      if (tryEvidence) evidenceParams = true;
    } catch (error) {
      // Feature check: a database without the evidence parameters answers
      // PGRST202 (no matching function); record the decision without them.
      if (
        !tryEvidence ||
        !(error instanceof MeetSelfRpcError) ||
        error.pgCode !== 'PGRST202'
      )
        throw error;
      evidenceParams = false;
      rows = await send(false);
    }
    const row = first(rows);
    if (!row) throw new MeetSelfRpcError(503, 'Consent was not recorded', '');
    return row;
  },

  openStream: async (
    db: TypedSupabaseClient,
    input: {
      sessionId: string;
      accountId: string;
      generation: number;
      consentRevision: number;
    }
  ) => {
    const row = first(
      await call(db, 'meet_ai_self_v1_open_stream', {
        p_session_id: input.sessionId,
        p_account_id: input.accountId,
        p_generation: input.generation,
        p_consent_revision: input.consentRevision,
      })
    );
    if (!row) throw new MeetSelfRpcError(503, 'Stream was not opened', '');
    return row;
  },

  renewStream: (
    db: TypedSupabaseClient,
    input: { streamId: string; accountId: string }
  ) =>
    call(db, 'meet_ai_self_v1_renew_stream', {
      p_stream_id: input.streamId,
      p_account_id: input.accountId,
    }),

  closeStream: (
    db: TypedSupabaseClient,
    input: { sessionId: string; accountId: string; roomSeq: number }
  ) =>
    call(db, 'meet_ai_self_v1_close_stream', {
      p_session_id: input.sessionId,
      p_account_id: input.accountId,
      p_room_seq: input.roomSeq,
    }),

  revokeUpload: (
    db: TypedSupabaseClient,
    input: { sessionId: string; accountId: string; roomSeq: number }
  ) =>
    call(db, 'meet_ai_self_v1_revoke_upload', {
      p_session_id: input.sessionId,
      p_account_id: input.accountId,
      p_room_seq: input.roomSeq,
    }),

  reserveChunk: (
    db: TypedSupabaseClient,
    input: {
      id: string;
      sessionId: string;
      streamId: string;
      accountId: string;
      sequence: number;
      startSample: number;
      startMs: number;
      endMs: number;
      digestHex: string;
      consentRevision: number;
      audioSeconds: number;
      maxCostUsd: number;
    }
  ) =>
    call(db, 'meet_ai_self_v1_reserve_chunk', {
      p_id: input.id,
      p_session_id: input.sessionId,
      p_stream_id: input.streamId,
      p_account_id: input.accountId,
      p_sequence: input.sequence,
      p_start_sample: input.startSample,
      p_start_ms: input.startMs,
      p_end_ms: input.endMs,
      // PostgREST takes bytea as a hex literal.
      p_content_digest: `\\x${input.digestHex}`,
      p_consent_revision: input.consentRevision,
      p_audio_seconds: input.audioSeconds,
      p_max_cost_usd: input.maxCostUsd,
    }) as Promise<MeetAiChunkRow>,

  markDispatch: (
    db: TypedSupabaseClient,
    input: { chunkId: string; accountId: string; consentRevision: number }
  ) =>
    call(db, 'meet_ai_self_v1_mark_dispatch', {
      p_chunk_id: input.chunkId,
      p_account_id: input.accountId,
      p_consent_revision: input.consentRevision,
    }) as Promise<MeetAiChunkRow>,

  settleChunk: (
    db: TypedSupabaseClient,
    input: {
      chunkId: string;
      outcome: 'completed' | 'discarded' | 'released' | 'unknown';
      transcript?: string | null;
      usage?: Json | null;
      costUsd?: number | null;
    }
  ) =>
    call(db, 'meet_ai_self_v1_settle_chunk', {
      p_chunk_id: input.chunkId,
      p_outcome: input.outcome,
      // Released and unknown outcomes take no text, usage or cost.
      p_transcript: (input.transcript ?? null) as string,
      p_usage: (input.usage ?? null) as Json,
      p_cost_usd: (input.costUsd ?? null) as number,
    }) as Promise<MeetAiChunkRow>,

  noteAttempt: (db: TypedSupabaseClient, sessionId: string) =>
    call(db, 'meet_ai_self_v1_note_attempt', { p_session_id: sessionId }),

  consentState: async (
    db: TypedSupabaseClient,
    input: { sessionId: string; accountId: string }
  ) =>
    first(
      await call(db, 'meet_ai_self_v1_consent_state', {
        p_session_id: input.sessionId,
        p_account_id: input.accountId,
      })
    ) ?? null,
};
