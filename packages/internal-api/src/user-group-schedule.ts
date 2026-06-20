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

export interface WorkspaceUserGroupMissingSessionOccurrence {
  date: string;
  description: string | null;
  descriptionJson: WorkspaceUserGroupSessionDescriptionJson | null;
  endTimezone: string;
  endsAt: string;
  groupId: string;
  groupName: string | null;
  seriesId: string;
  startTimezone: string;
  startsAt: string;
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

export interface WorkspaceUserGroupSchedulePattern {
  daysOfWeek: number[];
  endTime: string;
  exceptionCount: number;
  expectedCount: number;
  occurrenceCount: number;
  startTime: string;
}

export interface WorkspaceUserGroupScheduleGroupSummary {
  exceptionCount: number;
  groupId: string;
  managerCount: number;
  nonManagerCount: number;
  patterns: WorkspaceUserGroupSchedulePattern[];
  upcomingCount: number;
}

export interface WorkspaceUserGroupRosterMember {
  avatar_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  id: string;
  phone?: string | null;
  role?: string | null;
}

export interface ListWorkspaceUserGroupSessionsParams extends InternalApiQuery {
  from?: string;
  groupId?: string;
  includeMissing?: boolean;
  to?: string;
}

export interface ListWorkspaceUserGroupSessionsResponse {
  data: WorkspaceUserGroupSession[];
  groups: WorkspaceUserGroupScheduleGroup[];
  missing?: WorkspaceUserGroupMissingSessionOccurrence[];
  tags: WorkspaceUserGroupScheduleTag[];
}

export interface ListWorkspaceUserGroupScheduleGroupSummariesParams {
  from: string;
  groupIds: string[];
  timezone: string;
}

export interface ListWorkspaceUserGroupScheduleGroupSummariesResponse {
  data: WorkspaceUserGroupScheduleGroupSummary[];
}

export interface ListWorkspaceUserGroupMembersParams extends InternalApiQuery {
  limit?: number;
  offset?: number;
}

export interface ListWorkspaceUserGroupMembersResponse {
  count?: number;
  data: WorkspaceUserGroupRosterMember[];
  next?: number;
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

export interface RepairWorkspaceUserGroupSessionOccurrencePayload {
  date: string;
  groupId: string;
  seriesId: string;
}

export interface RepairWorkspaceUserGroupSessionOccurrenceResponse {
  data?: WorkspaceUserGroupSession;
  message: string;
}

export interface ReconcileWorkspaceUserGroupSessionResponse {
  data?: WorkspaceUserGroupSession;
  message: string;
}

export type WorkspaceUserGroupSessionReconciliationMode =
  | 'convert_weekly'
  | 'exact'
  | 'snap'
  | 'weekly';

export interface ReconcileWorkspaceUserGroupSessionPayload {
  mode?: WorkspaceUserGroupSessionReconciliationMode;
}

export interface WorkspaceUserGroupSessionReconciliationPreview {
  date: string;
  mode: WorkspaceUserGroupSessionReconciliationMode;
  occurrence: WorkspaceUserGroupMissingSessionOccurrence;
  seriesId: string;
  session: WorkspaceUserGroupSession;
}

export interface PreviewWorkspaceUserGroupSessionReconciliationResponse {
  data?: WorkspaceUserGroupSessionReconciliationPreview;
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

export function listWorkspaceUserGroupScheduleGroupSummaries(
  workspaceId: string,
  params: ListWorkspaceUserGroupScheduleGroupSummariesParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceUserGroupScheduleGroupSummariesResponse>(
    `${basePath(workspaceId)}/group-summaries`,
    {
      cache: 'no-store',
      query: {
        from: params.from,
        groupIds: params.groupIds.join(','),
        timezone: params.timezone,
      },
    }
  );
}

export function listWorkspaceUserGroupMembers(
  workspaceId: string,
  groupId: string,
  params: ListWorkspaceUserGroupMembersParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceUserGroupMembersResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/members`,
    {
      cache: 'no-store',
      query: {
        limit: params.limit,
        offset: params.offset,
      },
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

export function repairWorkspaceUserGroupSessionOccurrence(
  workspaceId: string,
  payload: RepairWorkspaceUserGroupSessionOccurrencePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<RepairWorkspaceUserGroupSessionOccurrenceResponse>(
    `${basePath(workspaceId)}/occurrences`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function reconcileWorkspaceUserGroupSession(
  workspaceId: string,
  sessionId: string,
  payload: ReconcileWorkspaceUserGroupSessionPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ReconcileWorkspaceUserGroupSessionResponse>(
    `${basePath(workspaceId)}/${encodePathSegment(sessionId)}/reconcile`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function previewWorkspaceUserGroupSessionReconciliation(
  workspaceId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<PreviewWorkspaceUserGroupSessionReconciliationResponse>(
    `${basePath(workspaceId)}/${encodePathSegment(sessionId)}/reconcile`,
    {
      cache: 'no-store',
    }
  );
}
