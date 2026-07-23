import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface ForceSendWorkspacePostEmailPayload {
  postId: string;
  userId: string;
}

export interface UserGroupPostCheckPayload {
  user_id: string;
  is_completed: boolean;
  notes?: string | null;
}

export interface CreateUserGroupPostCheckPayload
  extends UserGroupPostCheckPayload {
  post_id: string;
}

export interface UserGroupPostCheckLogEntry {
  id: string;
  post_id: string;
  user_id: string;
  previous_is_completed: boolean | null;
  new_is_completed: boolean | null;
  changed_by: string | null;
  created_at: string;
}

export interface UserGroupPostRecipientSummary {
  checked: number;
  count: number;
  failed: number;
  missing_check: number;
  sent: number;
}

export interface UserGroupPostRecord {
  content: string | null;
  created_at: string;
  creator_id: string | null;
  group_id: string;
  id: string;
  notes: string | null;
  post_approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  recipient_summary?: UserGroupPostRecipientSummary;
  rejection_reason: string | null;
  title: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface UserGroupPostsResponse {
  count: number;
  data: UserGroupPostRecord[];
  nextCursor: string | null;
}

function userGroupPostChecksPath(
  workspaceId: string,
  groupId: string,
  postId?: string
) {
  const collectionPath = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/group-checks`;
  return postId
    ? `${collectionPath}/${encodePathSegment(postId)}`
    : collectionPath;
}

function userGroupPostsPath(workspaceId: string, groupId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/posts`;
}

export function listUserGroupPosts(
  workspaceId: string,
  groupId: string,
  query?: { cursor?: string | null; limit?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<UserGroupPostsResponse>(
    userGroupPostsPath(workspaceId, groupId),
    {
      cache: 'no-store',
      query: {
        cursor: query?.cursor ?? undefined,
        limit: query?.limit,
      },
    }
  );
}

export function createUserGroupPost(
  workspaceId: string,
  groupId: string,
  payload: Pick<UserGroupPostRecord, 'content' | 'notes' | 'title'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    userGroupPostsPath(workspaceId, groupId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updateUserGroupPost(
  workspaceId: string,
  groupId: string,
  postId: string,
  payload: Pick<UserGroupPostRecord, 'content' | 'notes' | 'title'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    `${userGroupPostsPath(workspaceId, groupId)}/${encodePathSegment(postId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export function deleteUserGroupPost(
  workspaceId: string,
  groupId: string,
  postId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    `${userGroupPostsPath(workspaceId, groupId)}/${encodePathSegment(postId)}`,
    { cache: 'no-store', method: 'DELETE' }
  );
}

export function createUserGroupPostCheck(
  workspaceId: string,
  groupId: string,
  payload: CreateUserGroupPostCheckPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    userGroupPostChecksPath(workspaceId, groupId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function updateUserGroupPostChecks(
  workspaceId: string,
  groupId: string,
  postId: string,
  payload: UserGroupPostCheckPayload | UserGroupPostCheckPayload[],
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    userGroupPostChecksPath(workspaceId, groupId, postId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export function clearUserGroupPostChecks(
  workspaceId: string,
  groupId: string,
  postId: string,
  userIds: string[],
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    userGroupPostChecksPath(workspaceId, groupId, postId),
    {
      body: JSON.stringify({ user_ids: userIds }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    }
  );
}

export function listUserGroupPostCheckLogs(
  workspaceId: string,
  groupId: string,
  postId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    logs: UserGroupPostCheckLogEntry[];
  }>(`${userGroupPostChecksPath(workspaceId, groupId, postId)}/logs`, {
    cache: 'no-store',
  });
}

export interface GetWorkspacePostsQuery {
  page?: number;
  pageSize?: number;
  start?: string;
  end?: string;
  includedGroups?: string[];
  excludedGroups?: string[];
  userId?: string;
  stage?: string;
  queueStatus?: string;
  approvalStatus?: string;
  showAll?: boolean;
  cursor?: string;
}

export interface GetWorkspacePostsResponse<
  TPost = unknown,
  TSummary = unknown,
> {
  data: TPost[];
  count: number;
  summary: TSummary;
}

export interface GetWorkspacePostsBootstrapResponse {
  wsId: string;
  defaultDateRange: {
    start: string;
    end: string;
  };
}

export interface GetWorkspacePostsPermissionsResponse {
  canApprovePosts: boolean;
  canForceSendPosts: boolean;
}

export async function getWorkspacePosts<TPost = unknown, TSummary = unknown>(
  workspaceId: string,
  query?: GetWorkspacePostsQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const search = new URLSearchParams();

  for (const groupId of query?.includedGroups ?? []) {
    search.append('includedGroups', groupId);
  }

  for (const groupId of query?.excludedGroups ?? []) {
    search.append('excludedGroups', groupId);
  }

  const scalarQuery = {
    approvalStatus: query?.approvalStatus,
    cursor: query?.cursor,
    end: query?.end,
    page: query?.page,
    pageSize: query?.pageSize,
    queueStatus: query?.queueStatus,
    showAll: query?.showAll,
    stage: query?.stage,
    start: query?.start,
    userId: query?.userId,
  };
  const suffix = search.toString();
  return client.json<GetWorkspacePostsResponse<TPost, TSummary>>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/posts${suffix ? `?${suffix}` : ''}`,
    {
      query: scalarQuery,
      cache: 'no-store',
    }
  );
}

export async function getWorkspacePostsBootstrap(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GetWorkspacePostsBootstrapResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/posts/bootstrap`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspacePostsPermissions(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GetWorkspacePostsPermissionsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/posts/permissions`,
    {
      cache: 'no-store',
    }
  );
}

export async function forceSendWorkspacePostEmail(
  workspaceId: string,
  payload: ForceSendWorkspacePostEmailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/posts/force-send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}
