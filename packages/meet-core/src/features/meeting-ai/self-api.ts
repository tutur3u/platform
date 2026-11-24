import {
  getInternalApiClient,
  InternalApiError,
  uploadMeetAiChunk,
} from '@tuturuuu/internal-api';

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

export function setSelfTranscriptChoice(
  wsId: string,
  meetingId: string,
  choice: 'allow' | 'decline'
) {
  return post<unknown>(`${base(wsId, meetingId)}/choice`, { choice });
}

export type SelfFailure = 'refused' | 'not_eligible' | 'unavailable' | 'retry';
/** How a failed open, renew or upload should be handled. */
export function classifySelfFailure(error: unknown): SelfFailure {
  if (!(error instanceof InternalApiError)) return 'retry';
  if (error.code === 'MEET_SELF_NOT_ELIGIBLE') return 'not_eligible';
  if (error.code === 'MEET_SELF_UNAVAILABLE') return 'unavailable';
  if (error.code === 'MEET_SELF_RATE_LIMITED' || error.status === 429)
    return 'retry';
  if ([401, 402, 403, 409, 423].includes(error.status)) return 'refused';
  return 'retry';
}
