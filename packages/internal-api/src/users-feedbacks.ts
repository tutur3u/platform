import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export interface ListWorkspaceUserFeedbacksParams extends InternalApiQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  requireAttention?: 'all' | 'true' | 'false';
  groupId?: string;
  userId?: string;
  creatorId?: string;
}

export interface WorkspaceUserFeedbackRecord {
  id: string;
  user_id: string;
  group_id: string;
  creator_id: string | null;
  content: string;
  require_attention: boolean;
  created_at: string;
  user: {
    id: string | null;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  creator: {
    id: string | null;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
  group: {
    id: string;
    name: string | null;
  } | null;
  user_name: string;
  creator_name: string;
  group_name: string;
}

export interface WorkspaceUserFeedbacksResponse {
  data: WorkspaceUserFeedbackRecord[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateWorkspaceUserFeedbackPayload {
  userId: string;
  groupId: string;
  content: string;
  require_attention?: boolean;
}

export interface UpdateWorkspaceUserFeedbackPayload {
  content: string;
  require_attention?: boolean;
}

function buildWorkspaceFeedbackPath(workspaceId: string, feedbackId?: string) {
  const base = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/feedbacks`;
  return feedbackId
    ? `${base}?feedbackId=${encodeURIComponent(feedbackId)}`
    : base;
}

export async function listWorkspaceUserFeedbacks(
  workspaceId: string,
  params: ListWorkspaceUserFeedbacksParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceUserFeedbacksResponse>(
    buildWorkspaceFeedbackPath(workspaceId),
    {
      cache: 'no-store',
      query: params,
    }
  );
}

export async function createWorkspaceUserFeedback(
  workspaceId: string,
  payload: CreateWorkspaceUserFeedbackPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ message: string }>(
    buildWorkspaceFeedbackPath(workspaceId),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function updateWorkspaceUserFeedback(
  workspaceId: string,
  feedbackId: string,
  payload: UpdateWorkspaceUserFeedbackPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ message: string }>(
    buildWorkspaceFeedbackPath(workspaceId, feedbackId),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteWorkspaceUserFeedback(
  workspaceId: string,
  feedbackId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ message: string }>(
    buildWorkspaceFeedbackPath(workspaceId, feedbackId),
    {
      method: 'DELETE',
    }
  );
}
