import { uploadMeetAiChunk } from '@tuturuuu/internal-api';
import { getInternalApiClient } from '@tuturuuu/internal-api/client';

export type SelfStreamGrant = {
  streamId: string;
  consentRevision: number;
  leaseExpiresAt: string;
};
export type SelfChunkUpload = {
  sessionId: string;
  streamId: string;
  id: string;
  sequence: number;
  startSample: number;
  consentRevision: number;
  audio: Blob;
};
export type SelfCaptureApi = {
  open: (input: { sessionId: string }) => Promise<SelfStreamGrant>;
  renew: (input: {
    sessionId: string;
    streamId: string;
  }) => Promise<{ leaseExpiresAt: string }>;
  upload: (chunk: SelfChunkUpload, signal: AbortSignal) => Promise<unknown>;
};

const base = (wsId: string, meetingId: string) =>
  `/api/meet-ai/${encodeURIComponent(wsId)}/${encodeURIComponent(meetingId)}/self`;
const post = <T>(path: string, body: unknown) =>
  getInternalApiClient().json<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Chunk bodies carry only the fields the server accepts; never a speaker. */
export function selfChunkForm(chunk: SelfChunkUpload) {
  const data = new FormData();
  data.set('sessionId', chunk.sessionId);
  data.set('streamId', chunk.streamId);
  data.set('id', chunk.id);
  data.set('sequence', String(chunk.sequence));
  data.set('startSample', String(chunk.startSample));
  data.set('consentRevision', String(chunk.consentRevision));
  data.set('audio', chunk.audio, 'own-microphone.wav');
  return data;
}

export function createSelfCaptureApi(
  wsId: string,
  meetingId: string
): SelfCaptureApi {
  return {
    open: (input) =>
      post<SelfStreamGrant>(`${base(wsId, meetingId)}/open`, input),
    renew: (input) =>
      post<{ leaseExpiresAt: string }>(`${base(wsId, meetingId)}/renew`, input),
    upload: (chunk, signal) =>
      uploadMeetAiChunk(
        wsId,
        meetingId,
        selfChunkForm(chunk),
        undefined,
        signal
      ),
  };
}

export function setMeetCaptureMode(
  wsId: string,
  meetingId: string,
  mode: 'room' | 'self'
) {
  return post<{ mode: 'room' | 'self' }>(`${base(wsId, meetingId)}/mode`, {
    mode,
  });
}

/**
 * A per-speaker transcript choice, with the notice the person saw: its
 * version, their locale and a SHA-256 of the exact text shown.
 */
export type SelfChoiceInput = {
  choice: 'allow' | 'decline';
  noticeVersion: string;
  locale: string;
  textHash: string;
};

export function setSelfTranscriptChoice(
  wsId: string,
  meetingId: string,
  input: SelfChoiceInput
) {
  return post<unknown>(`${base(wsId, meetingId)}/choice`, input);
}

export type SelfFailure =
  | 'refused'
  | 'not_eligible'
  | 'unavailable'
  /** The stream's lease lapsed; a new stream may be opened. */
  | 'lease_expired'
  /** The person must confirm the per-speaker notice before capturing. */
  | 'notice_required'
  | 'retry';

const fieldOf = (error: unknown, key: 'status' | 'code' | 'retryAfter') => {
  const record = typeof error === 'object' && error !== null ? error : {};
  return key in record ? (record as Record<string, unknown>)[key] : undefined;
};

/** How a failed open, renew or upload should be handled. */
export function classifySelfFailure(error: unknown): SelfFailure {
  const status = fieldOf(error, 'status');
  const code = fieldOf(error, 'code');
  if (code === 'MEET_SELF_NOT_ELIGIBLE') return 'not_eligible';
  if (code === 'MEET_SELF_UNAVAILABLE') return 'unavailable';
  if (code === 'MEET_SELF_LEASE_EXPIRED') return 'lease_expired';
  if (code === 'MEET_SELF_NOTICE_REQUIRED') return 'notice_required';
  if (code === 'MEET_SELF_RATE_LIMITED' || status === 429) return 'retry';
  if (typeof status === 'number' && [401, 402, 403, 409, 423].includes(status))
    return 'refused';
  return 'retry';
}

/** A rate limit, and how long the server asked us to wait, at least `min`. */
export function selfRetryDelay(error: unknown, fallback: number, min = 0) {
  const status = fieldOf(error, 'status');
  const code = fieldOf(error, 'code');
  if (status !== 429 && code !== 'MEET_SELF_RATE_LIMITED') return fallback;
  const retryAfter = fieldOf(error, 'retryAfter');
  const asked =
    typeof retryAfter === 'number' && Number.isFinite(retryAfter)
      ? Math.min(retryAfter, 300) * 1000
      : 0;
  return Math.max(min, asked);
}

/**
 * The choice was made under a notice the server no longer offers, or not
 * the one it expects now (a stale version, other text, or the other mode).
 * The person is asked again under the current notice; nothing is retried
 * on their behalf.
 */
const STALE_NOTICE_CODES = new Set([
  'MEET_SELF_NOTICE_STALE',
  'MEET_SELF_NOTICE_MISMATCH',
  'MIRA_ROOM_NOTICE_MODE_STALE',
]);

export function isStaleSelfNotice(error: unknown) {
  const code = fieldOf(error, 'code');
  return typeof code === 'string' && STALE_NOTICE_CODES.has(code);
}
