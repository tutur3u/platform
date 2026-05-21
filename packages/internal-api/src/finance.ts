import type {
  FinanceBudget,
  FinanceBudgetStatus,
  Wallet,
} from '@tuturuuu/types';
import type {
  TransactionCategory,
  TransactionCategoryWithStats,
} from '@tuturuuu/types/primitives/TransactionCategory';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
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

export async function getWallet(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Wallet>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWallet(
  workspaceId: string,
  payload: WalletPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWallet(
  workspaceId: string,
  walletId: string,
  payload: WalletPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWallet(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listBudgets(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceBudget[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets`,
    {
      cache: 'no-store',
    }
  );
}

export async function getBudgetStatus(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceBudgetStatus[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/status`,
    {
      cache: 'no-store',
    }
  );
}

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

export type WalletPayload = Partial<
  Pick<
    Wallet,
    | 'balance'
    | 'currency'
    | 'description'
    | 'icon'
    | 'id'
    | 'image_src'
    | 'limit'
    | 'name'
    | 'payment_date'
    | 'report_opt_in'
    | 'statement_date'
    | 'type'
  >
>;

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

export interface RecurringTransactionRecord
  extends RecurringTransactionPayload {
  id: string;
  next_occurrence: string;
  is_active: boolean;
}

export type TransactionExportRow = {
  amount: number | null;
  description: string | null;
  category: string | null;
  transaction_type: 'expense' | 'income' | null;
  wallet: string | null;
  tags: string | null;
  taken_at: string | null;
  created_at: string | null;
  report_opt_in: boolean | null;
  creator_name: string | null;
  creator_email: string | null;
  invoice_for_name: string | null;
  invoice_for_email: string | null;
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

export type ListTransactionsQuery = {
  page?: string | number;
  itemsPerPage?: string | number;
};

function appendFinanceArrayParam(
  searchParams: URLSearchParams,
  key: string,
  value?: string | string[]
) {
  if (!value) {
    return;
  }

  const values = Array.isArray(value) ? value : [value];

  for (const entry of values) {
    if (entry) {
      searchParams.append(key, entry);
    }
  }
}

function buildTransactionExportSearchParams(query: TransactionExportQuery) {
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

export async function createBudget(
  workspaceId: string,
  payload: FinanceBudgetUpsertPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceBudget>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateBudget(
  workspaceId: string,
  budgetId: string,
  payload: FinanceBudgetUpsertPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceBudget>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/${encodePathSegment(budgetId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteBudget(
  workspaceId: string,
  budgetId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/budgets/${encodePathSegment(budgetId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function deleteInvoice(
  workspaceId: string,
  invoiceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/${encodePathSegment(invoiceId)}`,
    {
      method: 'DELETE',
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

export async function getTransactionCategory(
  workspaceId: string,
  categoryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionCategory>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createTransactionCategory(
  workspaceId: string,
  payload: TransactionCategoryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string; data: TransactionCategory }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateTransactionCategory(
  workspaceId: string,
  categoryId: string,
  payload: TransactionCategoryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteTransactionCategory(
  workspaceId: string,
  categoryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/categories/${encodePathSegment(categoryId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listTransactions(
  workspaceId: string,
  query: ListTransactionsQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<unknown[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function getTransaction(
  workspaceId: string,
  transactionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<unknown>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createTransaction(
  workspaceId: string,
  payload: TransactionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string; transaction_id: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateTransaction(
  workspaceId: string,
  transactionId: string,
  payload: TransactionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteTransaction(
  workspaceId: string,
  transactionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listTransactionExportRows(
  workspaceId: string,
  query: TransactionExportQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const queryString = buildTransactionExportSearchParams(query);

  return client.json<{ data: TransactionExportRow[]; count: number }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/export${queryString}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listRecurringTransactions(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    recurringTransactions: RecurringTransactionRecord[];
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions`,
    {
      cache: 'no-store',
    }
  );

  return payload.recurringTransactions ?? [];
}

export async function listUpcomingRecurringTransactions(
  workspaceId: string,
  query?: { daysAhead?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ upcomingTransactions: unknown[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/upcoming`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.upcomingTransactions ?? [];
}

export async function createRecurringTransaction(
  workspaceId: string,
  payload: RecurringTransactionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RecurringTransactionRecord>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateRecurringTransaction(
  workspaceId: string,
  recurringTransactionId: string,
  payload: RecurringTransactionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RecurringTransactionRecord>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/${encodePathSegment(recurringTransactionId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteRecurringTransaction(
  workspaceId: string,
  recurringTransactionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/recurring-transactions/${encodePathSegment(recurringTransactionId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function getTransactionStats(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    totalTransactions: number;
    totalIncome: number;
    totalExpense: number;
    netTotal: number;
    hasRedactedAmounts: boolean;
  }>(`/api/workspaces/${encodePathSegment(workspaceId)}/transactions/stats`, {
    query,
    cache: 'no-store',
  });
}

export async function getCategoryBreakdown(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
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
  const client = getInternalApiClient(options);
  return client.json<Array<{ date: string; amount: number }>>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/spending-trends`,
    {
      query,
      cache: 'no-store',
    }
  );
}
