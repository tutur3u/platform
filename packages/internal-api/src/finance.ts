import {
  createInternalApiClient,
  type InternalApiClientOptions,
  internalApiClient,
} from './client';

function getClient(options?: InternalApiClientOptions) {
  return options ? createInternalApiClient(options) : internalApiClient;
}

export async function listWallets(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getClient(options);
  return client.json<unknown[]>(`/api/v1/workspaces/${workspaceId}/wallets`, {
    cache: 'no-store',
  });
}

export async function listTransactionCategories(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getClient(options);
  return client.json<unknown[]>(
    `/api/workspaces/${workspaceId}/transactions/categories`,
    {
      cache: 'no-store',
    }
  );
}
