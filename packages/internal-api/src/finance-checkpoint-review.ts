import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';

export async function setWalletCheckpointReview(
  workspaceId: string,
  walletId: string,
  checkpointId: string,
  payload: { reviewed: boolean; expected_updated_at: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<{ reviewed_at: string | null; updated_at: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/wallets/${encodePathSegment(walletId)}/checkpoints/${encodePathSegment(checkpointId)}/review`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export async function deleteWalletCheckpoint(
  workspaceId: string,
  walletId: string,
  checkpointId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/checkpoints/${encodePathSegment(checkpointId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
