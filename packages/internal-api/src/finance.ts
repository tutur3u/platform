import type { Wallet } from '@tuturuuu/types';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function listWallets(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Wallet[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets`,
    {
      cache: 'no-store',
    }
  );
}

export async function listTransactionCategories(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionCategoryWithStats[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories`,
    {
      cache: 'no-store',
    }
  );
}
