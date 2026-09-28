import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

export async function deleteDiscardedWorkspaceTaskMedia(
  workspaceId: string,
  paths: string[],
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTaskApiBaseUrl(clientOptions));
  return client.json<{ deleted: number }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/media`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
      cache: 'no-store',
    }
  );
}
