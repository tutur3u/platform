import { encodePathSegment, getInternalApiClient } from './client';
export type MeetFollowupContext = {
  user: {
    id: string;
    display_name: string | null;
    full_name: string | null;
    email: string | null;
  };
  timezone: string;
  workspaceId: string;
  workspaces: Array<{
    id: string;
    name: string | null;
    personal: boolean | null;
    access_type: 'member';
  }>;
  members?: Array<{
    id: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
  }>;
  calendars?: Array<{ id: string; name: string; calendar_type: string }>;
  boards: Array<{ id: string; name: string | null }>;
  lists: Array<{ id: string; name: string | null; status: string | null }>;
};
export type MeetFollowupInput = {
  requestId: string;
  startedAt: number;
  kind: 'task' | 'event';
  title: string;
  description: string;
  workspaceId: string;
  userId: string;
  listId: string;
  boardId: string;
  timezone: string;
  start: string;
  end: string;
  due: string;
  assignToMe: boolean;
  assigneeIds?: string[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  calendarId?: string;
  location?: string;
};
function endpoint(wsId: string, meetingId: string) {
  return `/api/meet-ai/${encodePathSegment(wsId)}/${encodePathSegment(meetingId)}/followups`;
}
export function getMeetFollowupContext(
  wsId: string,
  meetingId: string,
  workspaceId?: string,
  boardId?: string
) {
  return getInternalApiClient().json<MeetFollowupContext>(
    endpoint(wsId, meetingId),
    { query: { workspaceId, boardId }, cache: 'no-store' }
  );
}
export function createMeetFollowup(
  wsId: string,
  meetingId: string,
  input: MeetFollowupInput
) {
  return getInternalApiClient().json<{ url: string }>(
    endpoint(wsId, meetingId),
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function getMeetFollowupConflicts(
  wsId: string,
  meetingId: string,
  workspaceId: string,
  startAt: string,
  endAt: string
) {
  return getInternalApiClient().json<{ count: number }>(
    endpoint(wsId, meetingId),
    { query: { workspaceId, startAt, endAt }, cache: 'no-store' }
  );
}
