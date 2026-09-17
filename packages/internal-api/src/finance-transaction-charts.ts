import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
  withFinanceApiBaseUrl,
} from './client';

export async function getCategoryBreakdown(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<unknown[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/category-breakdown`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function getSpendingTrends(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<Array<{ date: string; amount: number }>>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/spending-trends`,
    {
      query,
      cache: 'no-store',
    }
  );
}
