import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiQuery,
} from '@tuturuuu/internal-api/client';
import type { TuturuuuUserClient } from './platform';
import {
  type FinancePaginatedResponse,
  withFinancePagination,
} from './platform-finance-pagination';

export interface FinanceBudgetUpsertPayload {
  name: string;
  description?: string | null;
  amount: number;
  period: 'monthly' | 'yearly' | 'custom';
  start_date: string;
  end_date?: string | null;
  alert_threshold?: number | null;
  category_id?: string | null;
  wallet_id?: string | null;
}

export type WalletPayload = Partial<{
  id: string;
  name: string;
  balance: number;
  currency: string;
  description: string | null;
  icon: string | null;
  image_src: string | null;
  limit: number | null;
  payment_date: number | null;
  report_opt_in: boolean;
  statement_date: number | null;
  type: 'STANDARD' | 'CREDIT';
}>;

export interface TransactionPayload {
  description?: string;
  amount?: number;
  origin_wallet_id?: string;
  category_id?: string;
  taken_at?: string | Date;
  report_opt_in?: boolean;
  tag_ids?: string[];
  is_amount_confidential?: boolean;
  is_description_confidential?: boolean;
  is_category_confidential?: boolean;
}

export interface TransactionCategoryPayload {
  name?: string;
  is_expense?: boolean;
  icon?: string | null;
  color?: string | null;
}

export interface RecurringTransactionPayload {
  name: string;
  description?: string | null;
  amount: number;
  wallet_id: string;
  category_id?: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string | null;
}

export type ListTransactionsQuery = {
  includeCount?: boolean | string;
  page?: string | number;
  itemsPerPage?: string | number;
};

export type TransactionExportQuery = {
  q?: string;
  page?: string;
  pageSize?: string;
  userIds?: string | string[];
  categoryIds?: string | string[];
  walletIds?: string | string[];
  tagIds?: string | string[];
  transactionType?: 'income' | 'expense';
  start?: string;
  end?: string;
};

function normalizeFinanceQuery(query?: Record<string, unknown>) {
  if (!query) return undefined;

  return Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.join(',')
          : (value as InternalApiQuery[string]),
      ])
  );
}

function appendFinanceArrayParam(
  searchParams: URLSearchParams,
  key: string,
  value?: string | string[]
) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];

  for (const entry of values) {
    if (entry) searchParams.append(key, entry);
  }
}

function buildTransactionExportQuery(query: TransactionExportQuery) {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set('q', query.q);
  if (query.page) searchParams.set('page', query.page);
  if (query.pageSize) searchParams.set('pageSize', query.pageSize);
  if (query.transactionType) {
    searchParams.set('transactionType', query.transactionType);
  }
  if (query.start) searchParams.set('start', query.start);
  if (query.end) searchParams.set('end', query.end);

  appendFinanceArrayParam(searchParams, 'userIds', query.userIds);
  appendFinanceArrayParam(searchParams, 'categoryIds', query.categoryIds);
  appendFinanceArrayParam(searchParams, 'walletIds', query.walletIds);
  appendFinanceArrayParam(searchParams, 'tagIds', query.tagIds);

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

export class FinanceClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  private api<T>(
    path: string,
    init: {
      body?: unknown;
      method?: string;
      query?: InternalApiQuery;
    } = {}
  ) {
    const apiClient = getInternalApiClient(this.client.getClientOptions());
    return apiClient.json<T>(path, {
      method: init.method,
      query: init.query,
      ...(init.body === undefined
        ? {}
        : {
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(init.body),
          }),
      cache: 'no-store',
    });
  }

  createBudget(workspaceId: string, payload: FinanceBudgetUpsertPayload) {
    return this.api<unknown>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets`,
      { body: payload, method: 'POST' }
    );
  }

  createRecurringTransaction(
    workspaceId: string,
    payload: RecurringTransactionPayload
  ) {
    return this.api<unknown>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions`,
      { body: payload, method: 'POST' }
    );
  }

  createTransaction(workspaceId: string, payload: TransactionPayload) {
    return this.api<{ message: string; transaction_id: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions`,
      { body: payload, method: 'POST' }
    );
  }

  createTransactionCategory(
    workspaceId: string,
    payload: TransactionCategoryPayload
  ) {
    return this.api<unknown>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories`,
      { body: payload, method: 'POST' }
    );
  }

  createWallet(workspaceId: string, payload: WalletPayload) {
    return this.api<{ message: string }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets`,
      { body: payload, method: 'POST' }
    );
  }

  deleteBudget(workspaceId: string, budgetId: string) {
    return this.api<{ success: true }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/${encodePathSegment(budgetId)}`,
      { method: 'DELETE' }
    );
  }

  deleteRecurringTransaction(
    workspaceId: string,
    recurringTransactionId: string
  ) {
    return this.api<{ success: true }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/${encodePathSegment(recurringTransactionId)}`,
      { method: 'DELETE' }
    );
  }

  deleteTransaction(workspaceId: string, transactionId: string) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`,
      { method: 'DELETE' }
    );
  }

  deleteTransactionCategory(workspaceId: string, categoryId: string) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`,
      { method: 'DELETE' }
    );
  }

  deleteWallet(workspaceId: string, walletId: string) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
      { method: 'DELETE' }
    );
  }

  getBudgetStatus(workspaceId: string) {
    return this.api<unknown[]>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/status`
    );
  }

  getCategoryBreakdown(workspaceId: string, query?: InternalApiQuery) {
    return this.api<unknown[]>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/category-breakdown`,
      { query }
    );
  }

  getSpendingTrends(workspaceId: string, query?: InternalApiQuery) {
    return this.api<Array<{ date: string; amount: number }>>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/spending-trends`,
      { query }
    );
  }

  getTransaction(workspaceId: string, transactionId: string) {
    return this.api<unknown>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`
    );
  }

  getTransactionCategory(workspaceId: string, categoryId: string) {
    return this.api<unknown>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`
    );
  }

  getTransactionStats(workspaceId: string, query?: InternalApiQuery) {
    return this.api<unknown>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/stats`,
      { query }
    );
  }

  getWallet(workspaceId: string, walletId: string) {
    return this.api<unknown>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`
    );
  }

  listBudgets(workspaceId: string) {
    return this.api<unknown[]>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets`
    );
  }

  listRecurringTransactions(workspaceId: string) {
    return this.api<{ recurringTransactions?: unknown[] }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions`
    ).then((payload) => payload.recurringTransactions ?? []);
  }

  listTransactionCategories(workspaceId: string) {
    return this.api<unknown[]>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories`
    );
  }

  listTransactionExportRows(
    workspaceId: string,
    query: TransactionExportQuery = {}
  ) {
    return this.api<{ data: unknown[]; count: number }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/export${buildTransactionExportQuery(query)}`
    ).then((payload) =>
      withFinancePagination(payload, {
        page: query.page,
        pageSize: query.pageSize,
      })
    );
  }

  listTransactions(workspaceId: string, query: ListTransactionsQuery = {}) {
    return this.api<unknown[] | FinancePaginatedResponse>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions`,
      { query: normalizeFinanceQuery(query) }
    );
  }

  listUpcomingRecurringTransactions(
    workspaceId: string,
    query?: { daysAhead?: number }
  ) {
    return this.api<{ upcomingTransactions?: unknown[] }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/upcoming`,
      { query }
    ).then((payload) => payload.upcomingTransactions ?? []);
  }

  listWallets(workspaceId: string) {
    return this.api<unknown[]>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets`
    );
  }

  updateBudget(
    workspaceId: string,
    budgetId: string,
    payload: FinanceBudgetUpsertPayload
  ) {
    return this.api<unknown>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/${encodePathSegment(budgetId)}`,
      { body: payload, method: 'PATCH' }
    );
  }

  updateRecurringTransaction(
    workspaceId: string,
    recurringTransactionId: string,
    payload: RecurringTransactionPayload
  ) {
    return this.api<unknown>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/${encodePathSegment(recurringTransactionId)}`,
      { body: payload, method: 'PUT' }
    );
  }

  updateTransaction(
    workspaceId: string,
    transactionId: string,
    payload: TransactionPayload
  ) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`,
      { body: payload, method: 'PUT' }
    );
  }

  updateTransactionCategory(
    workspaceId: string,
    categoryId: string,
    payload: TransactionCategoryPayload
  ) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`,
      { body: payload, method: 'PUT' }
    );
  }

  updateWallet(workspaceId: string, walletId: string, payload: WalletPayload) {
    return this.api<{ message: string }>(
      `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
      { body: payload, method: 'PUT' }
    );
  }
}
