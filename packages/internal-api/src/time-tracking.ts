import type { Tables } from '@tuturuuu/types';
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
