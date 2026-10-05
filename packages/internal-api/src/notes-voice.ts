import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
export type NotesVoiceArtifact = {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: {
    task: string;
    owner: string | null;
    dueDate: string | null;
    evidence: string;
  }[];
  recommendations: { suggestion: string; evidence: string }[];
  openQuestions: string[];
};
export type NotesVoiceJob = {
  id: string;
  wsId: string;
  status:
    | 'pending'
    | 'transcribing'
    | 'summarizing'
    | 'completed'
    | 'failed'
    | 'review_required';
  revision: number;
  transcript: string | null;
  artifact: NotesVoiceArtifact | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};
const path = (wsId: string, jobId?: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/notes/voice-jobs${jobId ? `/${encodePathSegment(jobId)}` : ''}`;
export function createNotesVoiceJob(
  wsId: string,
  input: {
    audio: Blob;
    requestId: string;
    timezone: string;
    expectedRevision?: number;
  },
  options?: InternalApiClientOptions
) {
  const body = new FormData();
  body.append('audio', input.audio, 'voice-note.wav');
  body.append('requestId', input.requestId);
  body.append('timezone', input.timezone);
  if (input.expectedRevision !== undefined)
    body.append('expectedRevision', String(input.expectedRevision));
  return getInternalApiClient(options).json<NotesVoiceJob>(path(wsId), {
    method: 'POST',
    body,
    cache: 'no-store',
  });
}
export function getNotesVoiceJob(
  wsId: string,
  jobId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<NotesVoiceJob>(path(wsId, jobId), {
    cache: 'no-store',
  });
}
export function deleteNotesVoiceJob(
  wsId: string,
  jobId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ deleted: true }>(
    path(wsId, jobId),
    { method: 'DELETE' }
  );
}
