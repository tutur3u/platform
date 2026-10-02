import { getInternalApiClient, type InternalApiClientOptions } from './client';

/** Private UI preferences; never filter canonical listWorkspaces with this. */
export async function getCurrentUserHiddenWorkspaces(
  expectedActorId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ hiddenWorkspaceIds: string[] }>(
    `/api/v1/users/me/hidden-workspaces?expectedActorId=${encodeURIComponent(expectedActorId)}`,
    { cache: 'no-store' }
  );
}

export async function updateCurrentUserHiddenWorkspace(
  workspaceId: string,
  hidden: boolean,
  expectedActorId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    workspaceId: string;
    hidden: boolean;
  }>('/api/v1/users/me/hidden-workspaces', {
    method: 'PUT',
    body: JSON.stringify({ workspaceId, hidden, expectedActorId }),
    cache: 'no-store',
  });
}
