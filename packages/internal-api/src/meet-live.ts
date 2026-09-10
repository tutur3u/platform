import { getInternalApiClient, type InternalApiClientOptions } from './client';
export type MeetPrivateMemory = {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'project';
  created_at: string;
};
export function readMeetPrivateMemory(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<{
    enabled: boolean;
    memories: MeetPrivateMemory[];
  }>('/api/meet-live/memory', { cache: 'no-store' });
}
export function updateMeetPrivateMemory(
  payload:
    | { action: 'settings'; enabled: boolean }
    | {
        action: 'save';
        content: string;
        category: MeetPrivateMemory['category'];
      }
    | { action: 'edit'; id: string; content: string }
    | { action: 'delete'; id: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    '/api/meet-live/memory',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export type MeetLiveVoice = 'Aoede' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
type LiveStart = {
  action: 'start';
  mode: 'personal' | 'room';
  timezone: string;
  workspaceId?: string;
  voice?: MeetLiveVoice;
};
type LiveConnection = {
  sessionId: string;
  token: string;
  mode: 'personal' | 'room';
};
export function controlMeetLive(
  meetingId: string,
  command: LiveStart | { action: 'resume'; sessionId: string }
): Promise<LiveConnection>;
export function controlMeetLive(
  meetingId: string,
  command: { action: 'stop'; sessionId: string }
): Promise<{ ok: boolean }>;
export function controlMeetLive(
  meetingId: string,
  command: LiveStart | { action: 'resume' | 'stop'; sessionId: string }
) {
  return getInternalApiClient().json<LiveConnection | { ok: boolean }>(
    `/api/meet-live/${encodeURIComponent(meetingId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }
  );
}

export function reviewMeetLiveTool(
  meetingId: string,
  payload: { sessionId: string; reviewId: string; approved: boolean }
) {
  return getInternalApiClient().json<{ ok: boolean }>(
    `/api/meet-live/${encodeURIComponent(meetingId)}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
