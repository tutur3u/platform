import { encodePathSegment, type InternalApiClientOptions } from './client';
import { getMeetApiClient } from './meet-client';

export type MeetAiNotes = {
  incomplete: boolean;
  summary: string;
  decisions: string[];
  actionItems: {
    task: string;
    owner: string | null;
    ownerId?: string | null;
    dueDate: string | null;
  }[];
  openQuestions: string[];
  calendarSuggestions?: Array<{
    title: string;
    evidence: string;
    timeText: string | null;
    startLocal: string | null;
    endLocal: string | null;
    timezone: string | null;
  }>;
};
export type MeetAiChunk = {
  id: string;
  sequence: number;
  start_seconds: number;
  duration_seconds: number;
  status: string;
  transcript: string | null;
  speaker?: {
    accountId: string;
    displayName: string;
    kind: 'microphone' | 'shared_audio';
  } | null;
  segments?: Array<{
    speaker: NonNullable<MeetAiChunk['speaker']> | null;
    kind: 'microphone' | 'shared_audio';
    startSeconds: number;
    transcript: string;
  }>;
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
  transcriptionCostUsd: number | null;
  notesCostUsd: number | null;
  estimatedCostUsd: number | null;
  unpricedRequests: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};
const path = (wsId: string, meetingId: string) =>
  `/api/meet-ai/${encodePathSegment(wsId)}/${encodePathSegment(meetingId)}`;

export function getMeetAiState(
  wsId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getMeetApiClient(options).json<MeetAiState>(path(wsId, meetingId), {
    cache: 'no-store',
  });
}
export function updateMeetAiSession(
  wsId: string,
  meetingId: string,
  payload: {
    action: 'start' | 'finish';
    sessionId?: string;
    expectedChunks?: number;
    captureIncomplete?: boolean;
    timezone?: string;
  },
  options?: InternalApiClientOptions
) {
  return getMeetApiClient(options).json<{ sessionId: string }>(
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
  options?: InternalApiClientOptions,
  signal?: AbortSignal
) {
  return getMeetApiClient(options).json<MeetAiChunk>(
    `${path(wsId, meetingId)}/chunks`,
    {
      method: 'POST',
      body: data,
      signal,
      headers: data.has('sources') ? { 'X-Meet-Audio-Batch': '1' } : undefined,
    }
  );
}

export function updateMeetNotesSharing(
  wsId: string,
  meetingId: string,
  settings: { shareNotes?: boolean; shareNotesAfterMeeting?: boolean }
) {
  return getMeetApiClient().json<{ updated: boolean }>(path(wsId, meetingId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sharing', ...settings }),
  });
}

export {
  createMeetFollowup,
  getMeetFollowupConflicts,
  getMeetFollowupContext,
  type MeetFollowupContext,
  type MeetFollowupInput,
} from './meet-followups';
