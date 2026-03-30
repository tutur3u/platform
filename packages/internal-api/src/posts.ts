import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface ForceSendWorkspacePostEmailPayload {
  postId: string;
  userId: string;
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
