import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type MeetAiNotes = {
  incomplete: boolean;
  summary: string;
  decisions: string[];
  actionItems: { task: string; owner: string | null; dueDate: string | null }[];
  openQuestions: string[];
};
export type MeetAiChunk = {
  id: string;
  sequence: number;
  start_seconds: number;
  duration_seconds: number;
  status: string;
  transcript: string | null;
  cost_usd: number | null;
};
export type MeetAiSession = {
  id: string;
  user_id: string;
  created_at: string;
  ended_at: string | null;
  notes_started_at: string | null;
  notes_status: string;
  notes: MeetAiNotes | null;
  notes_cost_usd: number | null;
};
export type MeetAiState = {
  configured: boolean;
  canManage: boolean;
  sessions: MeetAiSession[];
  chunks: MeetAiChunk[];
  model: string;
  transcriptionCostUsd: number;
  notesCostUsd: number;
  estimatedCostUsd: number;
  unpricedRequests: number;
  inputTokens: number;
  outputTokens: number;
};
const path = (wsId: string, meetingId: string) =>
  `/api/meet-ai/${encodePathSegment(wsId)}/${encodePathSegment(meetingId)}`;

export function getMeetAiState(
  wsId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetAiState>(
    path(wsId, meetingId),
    {
      cache: 'no-store',
    }
  );
}
export function updateMeetAiSession(
  wsId: string,
  meetingId: string,
  payload: {
    action: 'start' | 'finish';
    sessionId?: string;
    expectedChunks?: number;
    captureIncomplete?: boolean;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ sessionId: string }>(
    path(wsId, meetingId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
export function uploadMeetAiChunk(
  wsId: string,
  meetingId: string,
  data: FormData,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetAiChunk>(
    `${path(wsId, meetingId)}/chunks`,
    { method: 'POST', body: data }
  );
}
