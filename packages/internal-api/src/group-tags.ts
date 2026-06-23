import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface ListWorkspaceGroupTagsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListWorkspaceGroupTagsResponse {
  data: UserGroupTag[];
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated read of a workspace's user-group tags (with their linked group ids)
 * via `GET /api/v1/workspaces/:wsId/group-tags`. Forwards the caller's auth
 * (RLS-respecting).
 */
export async function listWorkspaceGroupTags(
  workspaceId: string,
  params?: ListWorkspaceGroupTagsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceGroupTagsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface UpsertWorkspaceGroupTagPayload {
  name: string;
  color: string;
  group_ids?: string[];
}

export interface UpsertWorkspaceGroupTagResponse {
  message: string;
}

/**
 * Creates a workspace user-group tag via
 * `POST /api/v1/workspaces/:wsId/group-tags`.
 */
export async function createWorkspaceGroupTag(
  workspaceId: string,
  payload: UpsertWorkspaceGroupTagPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpsertWorkspaceGroupTagResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags`,
    {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Updates a workspace user-group tag via
 * `PUT /api/v1/workspaces/:wsId/group-tags/:tagId`.
 */
export async function updateWorkspaceGroupTag(
  workspaceId: string,
  tagId: string,
  payload: UpsertWorkspaceGroupTagPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpsertWorkspaceGroupTagResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}`,
    {
      cache: 'no-store',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export interface DeleteWorkspaceGroupTagResponse {
  message: string;
}

/**
 * Deletes a workspace user-group tag via
 * `DELETE /api/v1/workspaces/:wsId/group-tags/:tagId`.
 */
export async function deleteWorkspaceGroupTag(
  workspaceId: string,
  tagId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DeleteWorkspaceGroupTagResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}`,
    { cache: 'no-store', method: 'DELETE' }
  );
}
