import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export const MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES = 18 * 1024 * 1024;
export const TRANSCRIPTION_MULTIPART_HEADROOM_BYTES = 1024 * 1024;
export const MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES =
  MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + TRANSCRIPTION_MULTIPART_HEADROOM_BYTES;

export const TRANSCRIPTION_AUDIO_MEDIA_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
] as const;

export type TranscriptionAudioMediaType =
  (typeof TRANSCRIPTION_AUDIO_MEDIA_TYPES)[number];
export type TranscriptionAudioInputErrorCode =
  | 'EMPTY_TRANSCRIPTION_AUDIO'
  | 'TRANSCRIPTION_AUDIO_TOO_LARGE'
  | 'UNSUPPORTED_TRANSCRIPTION_AUDIO_TYPE';

export class TranscriptionAudioInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 | 415,
    public readonly code: TranscriptionAudioInputErrorCode
  ) {
    super(message);
    this.name = 'TranscriptionAudioInputError';
  }
}

export function getTranscriptionAudioMediaType(
  mediaType: string
): TranscriptionAudioMediaType | null {
  const baseMediaType = mediaType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    TRANSCRIPTION_AUDIO_MEDIA_TYPES.find(
      (allowedMediaType) => allowedMediaType === baseMediaType
    ) ?? null
  );
}

export function validateTranscriptionAudioInput(
  audio: Pick<Blob, 'size' | 'type'>
): TranscriptionAudioMediaType {
  if (audio.size <= 0) {
    throw new TranscriptionAudioInputError(
      'The recording is empty.',
      400,
      'EMPTY_TRANSCRIPTION_AUDIO'
    );
  }

  if (audio.size > MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES) {
    throw new TranscriptionAudioInputError(
      'The recording exceeds the inline transcription limit.',
      413,
      'TRANSCRIPTION_AUDIO_TOO_LARGE'
    );
  }

  const mediaType = getTranscriptionAudioMediaType(audio.type);
  if (!mediaType) {
    throw new TranscriptionAudioInputError(
      'The recording format is not supported for inline transcription.',
      415,
      'UNSUPPORTED_TRANSCRIPTION_AUDIO_TYPE'
    );
  }

  return mediaType;
}

function getTranscriptionAudioFilename(mediaType: TranscriptionAudioMediaType) {
  const extensionByMediaType: Record<TranscriptionAudioMediaType, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
  };
  return `recording.${extensionByMediaType[mediaType]}`;
}

function meetingPath(workspaceId: string, meetingId?: string) {
  const base = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/meetings`;
  return meetingId ? `${base}/${encodePathSegment(meetingId)}` : base;
}

function recordingPath(
  workspaceId: string,
  meetingId: string,
  sessionId?: string
) {
  const base = `${meetingPath(workspaceId, meetingId)}/recordings`;
  return sessionId ? `${base}/${encodePathSegment(sessionId)}` : base;
}

export async function getWorkspaceMeetings<T>(
  workspaceId: string,
  query: { page: number; pageSize: number; search?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(meetingPath(workspaceId), {
    cache: 'no-store',
    query,
  });
}

export async function createWorkspaceMeeting<T>(
  workspaceId: string,
  payload: { name: string; time: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(meetingPath(workspaceId), {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function updateWorkspaceMeeting<T>(
  workspaceId: string,
  meetingId: string,
  payload: { name: string; time: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(
    meetingPath(workspaceId, meetingId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export async function deleteWorkspaceMeeting(
  workspaceId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<void>(
    meetingPath(workspaceId, meetingId),
    { cache: 'no-store', method: 'DELETE' }
  );
}

export async function getWorkspaceMeetingRecordings<T>(
  workspaceId: string,
  meetingId: string,
  query?: { limit?: number; status?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(
    recordingPath(workspaceId, meetingId),
    { cache: 'no-store', query }
  );
}

export async function toggleWorkspaceMeetingRecording<T>(
  workspaceId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(
    `${meetingPath(workspaceId, meetingId)}/record`,
    { cache: 'no-store', method: 'POST' }
  );
}

export async function uploadWorkspaceMeetingRecording<T>(
  workspaceId: string,
  meetingId: string,
  sessionId: string,
  audio: Blob,
  options?: InternalApiClientOptions
) {
  const body = new FormData();
  body.append('audio', audio);
  return getInternalApiClient(options).json<T>(
    `${recordingPath(workspaceId, meetingId, sessionId)}/upload`,
    { body, cache: 'no-store', method: 'POST' }
  );
}

export async function getWorkspaceMeetingRecordingPlayback<T>(
  workspaceId: string,
  meetingId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(
    `${recordingPath(workspaceId, meetingId, sessionId)}/play`,
    { cache: 'no-store' }
  );
}

export async function updateWorkspaceMeetingRecording<T>(
  workspaceId: string,
  meetingId: string,
  sessionId: string,
  payload: unknown,
  method: 'PATCH' | 'PUT',
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(
    recordingPath(workspaceId, meetingId, sessionId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method,
    }
  );
}

export async function deleteWorkspaceMeetingRecording(
  workspaceId: string,
  meetingId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<void>(
    recordingPath(workspaceId, meetingId, sessionId),
    { cache: 'no-store', method: 'DELETE' }
  );
}

export async function transcribeWorkspaceMeetingAudio<T>(
  audio: Blob,
  options?: InternalApiClientOptions
) {
  const mediaType = validateTranscriptionAudioInput(audio);
  const body = new FormData();
  body.append('audio', audio, getTranscriptionAudioFilename(mediaType));
  return getInternalApiClient(options).json<T>(
    '/api/ai/meetings/transcription',
    { body, cache: 'no-store', method: 'POST' }
  );
}
