import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface AccountDeleteBlockingWorkspace {
  memberCount: number;
  tier: string;
  wsId: string;
  wsName: string;
}

export interface AccountDeleteCleanupSummary {
  seatsToRevoke: number;
  workspacesToDelete: number;
}

export interface AccountDeletePrecheckResponse {
  blockingWorkspaces: AccountDeleteBlockingWorkspace[];
  canDelete: boolean;
  cleanupSummary: AccountDeleteCleanupSummary;
}

export interface DeleteCurrentUserAccountPayload {
  email: string;
}

export interface DeleteCurrentUserAccountResponse {
  message?: string;
}

export async function getCurrentUserAccountDeletePrecheck(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AccountDeletePrecheckResponse>('/api/v1/users/me/delete', {
    cache: 'no-store',
  });
}

export async function deleteCurrentUserAccount(
  payload: DeleteCurrentUserAccountPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<DeleteCurrentUserAccountResponse>(
    '/api/v1/users/me/delete',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}
