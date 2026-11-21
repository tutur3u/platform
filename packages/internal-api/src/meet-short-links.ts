import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type MeetShortLinkKind = 'generated' | 'vanity';

export interface MeetShortLink {
  id: string;
  slug: string;
  url: string;
  kind: MeetShortLinkKind;
  prefixed: boolean;
  expiresAt: string;
  clicks: number;
  canEdit: boolean;
  canDelete: boolean;
}

export interface MeetShortLinksState {
  eligible: boolean;
  staff: boolean;
  canonicalUrl: string;
  links: MeetShortLink[];
}

export type CreateMeetShortLinkPayload =
  | { kind: 'generated'; prefixed?: boolean }
  | { kind: 'vanity'; slug: string; prefixed?: boolean };

function shortLinksPath(
  workspaceId: string,
  meetingId: string,
  linkId?: string
) {
  const base = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/meetings/${encodePathSegment(meetingId)}/short-links`;
  return linkId ? `${base}/${encodePathSegment(linkId)}` : base;
}

export function getWorkspaceMeetingShortLinks(
  workspaceId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetShortLinksState>(
    shortLinksPath(workspaceId, meetingId),
    { cache: 'no-store' }
  );
}

export function createWorkspaceMeetingShortLink(
  workspaceId: string,
  meetingId: string,
  payload: CreateMeetShortLinkPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ link: MeetShortLink }>(
    shortLinksPath(workspaceId, meetingId),
    {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function updateWorkspaceMeetingShortLink(
  workspaceId: string,
  meetingId: string,
  linkId: string,
  payload: { slug: string; prefixed?: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ link: MeetShortLink }>(
    shortLinksPath(workspaceId, meetingId, linkId),
    {
      cache: 'no-store',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function deleteWorkspaceMeetingShortLink(
  workspaceId: string,
  meetingId: string,
  linkId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    shortLinksPath(workspaceId, meetingId, linkId),
    { cache: 'no-store', method: 'DELETE' }
  );
}
