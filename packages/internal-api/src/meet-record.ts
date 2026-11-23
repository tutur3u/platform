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
