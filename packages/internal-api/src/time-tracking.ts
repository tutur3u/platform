import type { InternalApiWorkspaceMember, Tables } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type WorkspaceBreakType = Tables<'workspace_break_types'>;

export interface CreateWorkspaceBreakTypeInput {
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  isDefault?: boolean;
}

export interface UpdateWorkspaceBreakTypeInput {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  isDefault?: boolean;
}

interface TimeTrackingRequestImageUrl {
  path: string;
  signedUrl: string | null;
}

interface TimeTrackingRequestImageUrlsResponse {
  urls: TimeTrackingRequestImageUrl[];
}

interface WorkspaceBreakTypesResponse {
  breakTypes: WorkspaceBreakType[];
}

interface WorkspaceBreakTypeResponse {
  breakType: WorkspaceBreakType;
}

export interface TimeTrackingBreakSummaryData {
  break_duration_seconds: number;
}

export interface TimeTrackingBreakRecord {
  id: string;
  session_id: string;
  break_type_id?: string | null;
  break_type_name?: string | null;
  break_start: string;
  break_end?: string | null;
  break_duration_seconds?: number | null;
}

export interface TimeTrackingWorkspaceTask {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  board_name?: string | null;
  list_name?: string | null;
  ticket_prefix?: string | null;
  assignees?: Array<{
    user?: Pick<
      InternalApiWorkspaceMember,
      'id' | 'display_name' | 'avatar_url' | 'email'
    > | null;
  }>;
}

export async function getTimeTrackingRequestImageUrls(
  workspaceId: string,
  requestId: string,
  imagePaths: string[],
  options?: InternalApiClientOptions
) {
  if (imagePaths.length === 0) {
    return [];
  }

  const client = getInternalApiClient(options);
  const payload = await client.json<TimeTrackingRequestImageUrlsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/requests/${encodePathSegment(requestId)}/image-urls`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imagePaths }),
    }
  );

  return payload.urls ?? [];
}

export async function listWorkspaceBreakTypes(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<WorkspaceBreakTypesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/break-types`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  return payload.breakTypes ?? [];
}

export async function createWorkspaceBreakType(
  workspaceId: string,
  input: CreateWorkspaceBreakTypeInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<WorkspaceBreakTypeResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/break-types`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!payload.breakType) {
    throw new Error(
      `missing breakType in createWorkspaceBreakType response (workspaceId=${workspaceId})`
    );
  }

  return payload.breakType;
}

export async function updateWorkspaceBreakType(
  workspaceId: string,
  breakTypeId: string,
  input: UpdateWorkspaceBreakTypeInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<WorkspaceBreakTypeResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/break-types/${encodePathSegment(breakTypeId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!payload.breakType) {
    throw new Error(
      `missing breakType in updateWorkspaceBreakType response (workspaceId=${workspaceId}, breakTypeId=${breakTypeId})`
    );
  }

  return payload.breakType;
}

export async function deleteWorkspaceBreakType(
  workspaceId: string,
  breakTypeId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  await client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/break-types/${encodePathSegment(breakTypeId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTimeTrackingTasks(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ tasks: TimeTrackingWorkspaceTask[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/tasks`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  return payload.tasks ?? [];
}

export async function listSessionBreaks(
  workspaceId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ breaks: TimeTrackingBreakRecord[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/breaks`,
    {
      query: { sessionId },
      cache: 'no-store',
    }
  );

  return payload.breaks ?? [];
}

export async function listSessionBreakSummaries(
  workspaceId: string,
  sessionIds: string[],
  options?: InternalApiClientOptions
) {
  if (sessionIds.length === 0) {
    return {} as Record<string, TimeTrackingBreakSummaryData[]>;
  }

  const client = getInternalApiClient(options);
  const payload = await client.json<{
    breaksBySession: Record<string, TimeTrackingBreakSummaryData[]>;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/breaks`,
    {
      query: {
        sessionIds: sessionIds.join(','),
        summaryOnly: true,
      },
      cache: 'no-store',
    }
  );

  return payload.breaksBySession ?? {};
}
