import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

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
  const body = new FormData();
  body.append('audio', audio, 'recording.mp3');
  return getInternalApiClient(options).json<T>(
    '/api/ai/meetings/transcription',
    { body, cache: 'no-store', method: 'POST' }
  );
}
