import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type {
  TransactionPeriodResponse,
  TransactionViewMode,
} from '@tuturuuu/types/primitives/TransactionPeriod';

export interface InfiniteTransactionsQuery {
  categoryIds?: string[];
  cursor?: string;
  end?: string | null;
  limit?: number;
  q?: string;
  start?: string | null;
  tagIds?: string[];
  transactionType?: string | null;
  userIds?: string[];
  walletId?: string;
  walletIds?: string[];
}

export interface TransactionResponse {
  data: Transaction[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount?: number;
}

export interface TransactionStatsResponse {
  hasRedactedAmounts: boolean;
  netTotal: number;
  totalExpense: number;
  totalIncome: number;
  totalTransactions: number;
}

export type MoneyLoverTransactionImportRow = {
  id: string;
  date: string;
  category: string;
  amount: string;
  currency: string;
  note: string;
  wallet: string;
};

export interface TransactionPeriodsQuery extends InfiniteTransactionsQuery {
  timezone: string;
  viewMode: TransactionViewMode;
}

function appendArrayParam(
  searchParams: URLSearchParams,
  key: string,
  values?: string[]
) {
  values?.forEach((value) => {
    if (value) searchParams.append(key, value);
  });
}

function buildTransactionsSearchParams(query: InfiniteTransactionsQuery) {
  const params = new URLSearchParams();

  if (query.cursor) params.set('cursor', query.cursor);
  if (query.q) params.set('q', query.q);
  if (query.walletId) params.set('walletId', query.walletId);
  if (query.transactionType) {
    params.set('transactionType', query.transactionType);
  }
  if (query.start) params.set('start', query.start);
  if (query.end) params.set('end', query.end);
  if (query.limit) params.set('limit', String(query.limit));

  appendArrayParam(params, 'userIds', query.userIds);
  appendArrayParam(params, 'categoryIds', query.categoryIds);
  appendArrayParam(params, 'walletIds', query.walletIds);
  appendArrayParam(params, 'tagIds', query.tagIds);

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

function buildTransactionPeriodsSearchParams(query: TransactionPeriodsQuery) {
  const params = new URLSearchParams(
    buildTransactionsSearchParams(query).replace(/^\?/u, '')
  );

  params.set('viewMode', query.viewMode);
  params.set('timezone', query.timezone);

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export function listInfiniteTransactionsWithInternalApi(
  workspaceId: string,
  query: InfiniteTransactionsQuery
) {
  const client = getInternalApiClient();
  return client.json<TransactionResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/infinite${buildTransactionsSearchParams(query)}`,
    { cache: 'no-store' }
  );
}

export function listTransactionPeriodsWithInternalApi(
  workspaceId: string,
  query: TransactionPeriodsQuery
) {
  const client = getInternalApiClient();
  return client.json<TransactionPeriodResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/periods${buildTransactionPeriodsSearchParams(query)}`,
    { cache: 'no-store' }
  );
}

export function getTransactionStatsWithInternalApi(
  workspaceId: string,
  query: InfiniteTransactionsQuery
) {
  const client = getInternalApiClient();
  return client.json<TransactionStatsResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/stats${buildTransactionsSearchParams(query)}`,
    { cache: 'no-store' }
  );
}

export function importMoneyLoverTransactionsWithInternalApi(
  workspaceId: string,
  transactions: MoneyLoverTransactionImportRow[]
) {
  const client = getInternalApiClient();
  const formData = new FormData();
  formData.append('transactions', JSON.stringify(transactions));

  return client.fetch(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/import/money-lover`,
    {
      body: formData,
      cache: 'no-store',
      method: 'POST',
    }
  );
}
