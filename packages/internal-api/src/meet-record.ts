import { encodePathSegment, getInternalApiClient } from './client';

export type MeetingProjectSummary = {
  id: string;
  name: string;
  status: string | null;
  ticketKey: string | null;
};

export type MeetingProjectLinks = {
  linked: MeetingProjectSummary[];
  available: MeetingProjectSummary[];
  canLink: boolean;
};

function projectsEndpoint(wsId: string, meetingId: string) {
  return `/api/meet-record/${encodePathSegment(wsId)}/${encodePathSegment(meetingId)}/projects`;
}

export function getMeetingProjectLinks(wsId: string, meetingId: string) {
  return getInternalApiClient().json<MeetingProjectLinks>(
    projectsEndpoint(wsId, meetingId),
    { cache: 'no-store' }
  );
}

function changeMeetingProjectLink(
  method: 'POST' | 'DELETE',
  wsId: string,
  meetingId: string,
  projectId: string
) {
  return getInternalApiClient().json<{ linked: MeetingProjectSummary[] }>(
    projectsEndpoint(wsId, meetingId),
    {
      method,
      body: JSON.stringify({ projectId }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function linkMeetingProject(
  wsId: string,
  meetingId: string,
  projectId: string
) {
  return changeMeetingProjectLink('POST', wsId, meetingId, projectId);
}

export function unlinkMeetingProject(
  wsId: string,
  meetingId: string,
  projectId: string
) {
  return changeMeetingProjectLink('DELETE', wsId, meetingId, projectId);
}

export type MeetingRecordItem = {
  id: string;
  kind: 'agenda' | 'decision';
  content: string;
  position: number;
  completedAt: string | null;
};

export type MeetingRecordTask = {
  id: string;
  name: string;
  done: boolean;
  doneAt: string | null;
  dueAt: string | null;
  boardId: string | null;
  boardName: string | null;
  assignees: Array<{ id: string; displayName: string | null }>;
  linkKind: 'source' | 'carried_over';
  carriedFromMeetingId: string | null;
};

export type MeetingRecord = {
  canEdit: boolean;
  isHost: boolean;
  items: MeetingRecordItem[];
  tasks: MeetingRecordTask[];
  defaultBoardId: string | null;
};

function recordEndpoint(wsId: string, meetingId: string) {
  return `/api/meet-record/${encodePathSegment(wsId)}/${encodePathSegment(meetingId)}`;
}

export function getMeetingRecord(wsId: string, meetingId: string) {
  return getInternalApiClient().json<MeetingRecord>(
    recordEndpoint(wsId, meetingId),
    { cache: 'no-store' }
  );
}

function sendRecordChange(
  method: 'POST' | 'PATCH' | 'DELETE',
  wsId: string,
  meetingId: string,
  body: object
) {
  return getInternalApiClient().json<{ id: string }>(
    recordEndpoint(wsId, meetingId),
    {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function addMeetingRecordItem(
  wsId: string,
  meetingId: string,
  input: { kind: MeetingRecordItem['kind']; content: string }
) {
  return sendRecordChange('POST', wsId, meetingId, input);
}

export function updateMeetingRecordItem(
  wsId: string,
  meetingId: string,
  input: { id: string; content?: string; completed?: boolean }
) {
  return sendRecordChange('PATCH', wsId, meetingId, input);
}

export function deleteMeetingRecordItem(
  wsId: string,
  meetingId: string,
  id: string
) {
  return sendRecordChange('DELETE', wsId, meetingId, { id });
}

export type SinceLastTimeTask = MeetingRecordTask & { fromMeetingId: string };

export type SinceLastTime = {
  previousMeeting: { id: string; name: string; time: string } | null;
  open: SinceLastTimeTask[];
  resolved: SinceLastTimeTask[];
  canCarry: boolean;
};

function sinceEndpoint(wsId: string, meetingId: string) {
  return `${recordEndpoint(wsId, meetingId)}/since`;
}

export function getSinceLastTime(wsId: string, meetingId: string) {
  return getInternalApiClient().json<SinceLastTime>(
    sinceEndpoint(wsId, meetingId),
    { cache: 'no-store' }
  );
}

export function carryOverMeetingItems(
  wsId: string,
  meetingId: string,
  taskIds: string[]
) {
  return getInternalApiClient().json<{ carried: number }>(
    sinceEndpoint(wsId, meetingId),
    {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
