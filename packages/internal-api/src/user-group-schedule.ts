import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export interface WorkspaceUserGroupSessionTag {
  color: string | null;
  id: string;
  name: string;
}

export interface WorkspaceUserGroupSessionFile {
  id: string;
  name: string | null;
  storagePath: string;
}

export type WorkspaceUserGroupSessionDescriptionJson = {
  [key: string]: unknown;
  attrs?: Record<string, unknown>;
  content?: WorkspaceUserGroupSessionDescriptionJson[];
  marks?: { attrs?: Record<string, unknown>; type: string }[];
  text?: string;
  type?: string;
};

export interface WorkspaceUserGroupSession {
  description: string | null;
  descriptionJson: WorkspaceUserGroupSessionDescriptionJson | null;
  endTimezone: string;
  endsAt: string;
  files: WorkspaceUserGroupSessionFile[];
  groupId: string;
  groupName: string | null;
  id: string;
  recurrenceInstanceDate: string | null;
  seriesId: string | null;
  source: string | null;
  startTimezone: string;
  startsAt: string;
  status: 'cancelled' | 'scheduled';
  tags: WorkspaceUserGroupSessionTag[];
  title: string | null;
}

export interface WorkspaceUserGroupScheduleTag {
  color: string | null;
  id: string;
  name: string;
}

export interface WorkspaceUserGroupScheduleGroup {
  id: string;
  name: string;
}

export interface ListWorkspaceUserGroupSessionsParams extends InternalApiQuery {
  from?: string;
  groupId?: string;
  to?: string;
}

export interface ListWorkspaceUserGroupSessionsResponse {
  data: WorkspaceUserGroupSession[];
  groups: WorkspaceUserGroupScheduleGroup[];
  tags: WorkspaceUserGroupScheduleTag[];
}

export interface WorkspaceUserGroupSessionFilePayload {
  name?: string | null;
  storagePath: string;
}

export interface WorkspaceUserGroupSessionRecurrencePayload {
  daysOfWeek: number[];
  intervalWeeks?: number;
  untilDate?: string | null;
}

export interface CreateWorkspaceUserGroupSessionPayload {
  description?: string | null;
  descriptionJson?: WorkspaceUserGroupSessionDescriptionJson | null;
  endTimezone: string;
  endsAt: string;
  files?: WorkspaceUserGroupSessionFilePayload[];
  groupId: string;
  recurrence?: WorkspaceUserGroupSessionRecurrencePayload | null;
  startTimezone: string;
  startsAt: string;
  tagIds?: string[];
  tagNames?: string[];
  title?: string | null;
}

export interface UpdateWorkspaceUserGroupSessionPayload {
  description?: string | null;
  descriptionJson?: WorkspaceUserGroupSessionDescriptionJson | null;
  endTimezone?: string;
  endsAt?: string;
  files?: WorkspaceUserGroupSessionFilePayload[];
  scope?: 'future' | 'once';
  startTimezone?: string;
  startsAt?: string;
  tagIds?: string[];
  tagNames?: string[];
  title?: string | null;
}

export interface WorkspaceUserGroupSessionMutationResponse {
  data?: WorkspaceUserGroupSession | WorkspaceUserGroupSession[];
  message: string;
}

function basePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/sessions`;
}

export function listWorkspaceUserGroupSessions(
  workspaceId: string,
  params: ListWorkspaceUserGroupSessionsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceUserGroupSessionsResponse>(
    basePath(workspaceId),
    {
      cache: 'no-store',
      query: params,
    }
  );
}

export function createWorkspaceUserGroupSession(
  workspaceId: string,
  payload: CreateWorkspaceUserGroupSessionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceUserGroupSessionMutationResponse>(
    basePath(workspaceId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updateWorkspaceUserGroupSession(
  workspaceId: string,
  sessionId: string,
  payload: UpdateWorkspaceUserGroupSessionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceUserGroupSessionMutationResponse>(
    `${basePath(workspaceId)}/${encodePathSegment(sessionId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}
