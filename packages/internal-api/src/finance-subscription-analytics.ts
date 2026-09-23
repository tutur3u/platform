import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';

export interface SubscriptionPaymentMetrics {
  paidUsers: number;
  paidGroups: number;
  memberships: number;
  invoiceCount: number;
  amount: number;
}
export interface SubscriptionPaymentPeriod extends SubscriptionPaymentMetrics {
  period: string;
}
export interface SubscriptionPaymentCurrency {
  currency: string;
  summary: SubscriptionPaymentMetrics;
  periods: SubscriptionPaymentPeriod[];
  distribution: { groupCount: number; userCount: number }[];
}
export interface SubscriptionPaymentAnalytics {
  year: number;
  granularity: 'monthly' | 'yearly';
  unallocatedInvoices: number;
  currencies: SubscriptionPaymentCurrency[];
}
export interface SubscriptionPaymentQuery {
  year: number;
  granularity: 'monthly' | 'yearly';
  userIds?: string[];
  walletIds?: string[];
}
export function getSubscriptionPaymentAnalytics(
  wsId: string,
  query: SubscriptionPaymentQuery,
  options?: InternalApiClientOptions
) {
  const search = new URLSearchParams({
    year: String(query.year),
    granularity: query.granularity,
  });
  for (const id of query.userIds ?? []) search.append('userIds', id);
  for (const id of query.walletIds ?? []) search.append('walletIds', id);
  return getInternalApiClient(
    withFinanceApiBaseUrl(options)
  ).json<SubscriptionPaymentAnalytics>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/finance/invoices/subscription-analytics?${search}`,
    { cache: 'no-store', signal: AbortSignal.timeout(60_000) }
  );
}
