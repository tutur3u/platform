import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';

export interface SubscriptionInvoiceContextQuery {
  groupIds: string[];
  month: string;
  monthCount?: number;
  userId: string;
}

export interface SubscriptionInvoiceContextResponse {
  attendance: Array<{
    date: string;
    group_id?: string;
    status: string;
  }>;
  latestInvoices: Array<{
    created_at?: string | null;
    group_id?: string;
    valid_until?: string | null;
  }>;
}

function buildSubscriptionInvoiceContextSearchParams(
  query: SubscriptionInvoiceContextQuery
) {
  const searchParams = new URLSearchParams({
    month: query.month,
    userId: query.userId,
  });

  if (query.monthCount !== undefined) {
    searchParams.set('monthCount', String(query.monthCount));
  }

  for (const groupId of query.groupIds) {
    if (groupId) searchParams.append('groupIds', groupId);
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

export async function getSubscriptionInvoiceContext(
  workspaceId: string,
  query: SubscriptionInvoiceContextQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<SubscriptionInvoiceContextResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/subscription/context${buildSubscriptionInvoiceContextSearchParams(query)}`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }
  );
}
