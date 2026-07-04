import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
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

export interface GetWorkspaceGroupTagResponse {
  data: UserGroupTag;
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

/**
 * Detail read of a workspace user-group tag via
 * `GET /api/v1/workspaces/:wsId/group-tags/:tagId`.
 */
export async function getWorkspaceGroupTag(
  workspaceId: string,
  tagId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GetWorkspaceGroupTagResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface ListWorkspaceGroupTagUserGroupsParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface ListWorkspaceGroupTagUserGroupsResponse {
  data: UserGroup[];
  count: number;
  page: number;
  pageSize: number;
}

/**
 * Lists user groups linked to a workspace user-group tag via
 * `GET /api/v1/workspaces/:wsId/group-tags/:tagId/user-groups`.
 */
export async function listWorkspaceGroupTagUserGroups(
  workspaceId: string,
  tagId: string,
  params?: ListWorkspaceGroupTagUserGroupsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize)
    searchParams.set('pageSize', params.pageSize.toString());
  if (params?.q) searchParams.set('q', params.q);

  const query = searchParams.toString();
  return client.json<ListWorkspaceGroupTagUserGroupsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}/user-groups${
      query ? `?${query}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export interface AddWorkspaceGroupTagUserGroupsPayload {
  groupIds: string[];
}

export interface WorkspaceGroupTagUserGroupsMutationResponse {
  message: string;
}

/**
 * Links user groups to a workspace user-group tag via
 * `POST /api/v1/workspaces/:wsId/group-tags/:tagId/user-groups`.
 */
export async function addWorkspaceGroupTagUserGroups(
  workspaceId: string,
  tagId: string,
  payload: AddWorkspaceGroupTagUserGroupsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceGroupTagUserGroupsMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}/user-groups`,
    {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Unlinks a user group from a workspace user-group tag via
 * `DELETE /api/v1/workspaces/:wsId/group-tags/:tagId/user-groups/:groupId`.
 */
export async function removeWorkspaceGroupTagUserGroup(
  workspaceId: string,
  tagId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceGroupTagUserGroupsMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/group-tags/${encodePathSegment(tagId)}/user-groups/${encodePathSegment(groupId)}`,
    { cache: 'no-store', method: 'DELETE' }
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
