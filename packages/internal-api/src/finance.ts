import type {
  FinanceBudget,
  FinanceBudgetStatus,
  InterestSummary,
  Wallet,
  WalletInterestConfig,
  WalletInterestProvider,
  WalletInterestRate,
  ZaloPayTier,
} from '@tuturuuu/types';
import type {
  DebtLoanFormData,
  DebtLoanStatus,
  DebtLoanSummary,
  DebtLoanType,
  DebtLoanWithBalance,
} from '@tuturuuu/types/primitives/DebtLoan';
import type {
  Invoice,
  InvoiceAnalyticsFilters,
  InvoiceTotalsByGroup,
} from '@tuturuuu/types/primitives/Invoice';
import type { PendingInvoice } from '@tuturuuu/types/primitives/PendingInvoice';
import type {
  TransactionCategory,
  TransactionCategoryWithStats,
} from '@tuturuuu/types/primitives/TransactionCategory';
import type {
  ViewingWindow,
  WorkspaceRoleWalletWhitelist,
} from '@tuturuuu/types/primitives/WorkspaceRoleWalletWhitelist';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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

export interface WalletCreditSummary {
  availableCredit: number;
  balance: number;
  currentActivity: number;
  cycleEnd: string;
  cycleStart: string;
  daysUntilPayment: number;
  daysUntilStatement: number;
  limit: number;
  nextPaymentDate: string;
  nextStatementDate: string;
  prevCycleEnd: string;
  prevCycleStart: string;
  statementBalance: number;
  totalOutstanding: number;
  utilization: number;
}

export type WalletRoleAccessPayload = {
  custom_days?: number;
  role_id: string;
  viewing_window: ViewingWindow;
};

export type WalletRoleViewingWindowPayload = {
  custom_days?: number;
  viewing_window: ViewingWindow;
};

export type WalletInterestSummaryResponse =
  | InterestSummary
  | {
      config?: WalletInterestConfig | null;
      enabled: false;
      message?: string;
    };

export type WalletInterestConfigPayload = {
  initial_rate?: number;
  provider: WalletInterestProvider;
  tracking_start_date?: string | null;
  zalopay_tier?: ZaloPayTier | null;
};

export type WalletInterestConfigUpdatePayload = {
  enabled?: boolean;
  tracking_end_date?: string | null;
  tracking_start_date?: string | null;
  zalopay_tier?: ZaloPayTier | null;
};

export type WalletInterestRatePayload = {
  annual_rate: number;
  effective_from?: string;
};

export async function getWalletCreditSummary(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WalletCreditSummary>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/credit-summary`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWalletRoleAccess(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleWalletWhitelist[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/roles`,
    {
      cache: 'no-store',
    }
  );
}

export async function addWalletRoleAccess(
  workspaceId: string,
  walletId: string,
  payload: WalletRoleAccessPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleWalletWhitelist>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/roles`,
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

export async function updateWalletRoleAccess(
  workspaceId: string,
  walletId: string,
  roleId: string,
  payload: WalletRoleViewingWindowPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleWalletWhitelist>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/roles/${encodePathSegment(roleId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function removeWalletRoleAccess(
  workspaceId: string,
  walletId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/roles/${encodePathSegment(roleId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function getWalletInterestSummary(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WalletInterestSummaryResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/interest`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWalletInterestConfig(
  workspaceId: string,
  walletId: string,
  payload: WalletInterestConfigPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WalletInterestConfig>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/interest`,
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

export async function updateWalletInterestConfig(
  workspaceId: string,
  walletId: string,
  payload: WalletInterestConfigUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WalletInterestConfig>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/interest/config`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteWalletInterestConfig(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/interest/config`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function createWalletInterestRate(
  workspaceId: string,
  walletId: string,
  payload: WalletInterestRatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WalletInterestRate>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}/interest/rates`,
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

export interface UpcomingRecurringTransactionRecord {
  id: string;
  name: string;
  amount: number;
  next_occurrence: string;
  wallet_name: string | null;
  category_name: string | null;
}

export type DebtLoanListQuery = {
  status?: DebtLoanStatus;
  type?: DebtLoanType;
};

export type DebtLoanPayload = Partial<DebtLoanFormData> & {
  status?: DebtLoanStatus;
};

export type FinanceChartRangeQuery = {
  endDate?: string | null;
  includeConfidential?: boolean;
  startDate?: string | null;
};

export type FinanceBalanceAtDateQuery = {
  date: string;
  includeConfidential?: boolean;
};

export type FinanceChartInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type FinanceChartTransactionType = 'expense' | 'income' | 'all';

export type FinanceCategoryBreakdownQuery = FinanceChartRangeQuery & {
  anchorToLatest?: boolean;
  interval?: FinanceChartInterval;
  timezone?: string;
  transactionType?: FinanceChartTransactionType;
};

export interface FinanceDailyIncomeExpensePoint {
  day: string;
  total_expense: number;
  total_income: number;
}

export interface FinanceMonthlyIncomeExpensePoint {
  month: string;
  total_expense: number;
  total_income: number;
}

export interface FinanceBalanceAtDate {
  balance: number;
  date: string;
}

export interface FinanceCategoryBreakdownPoint {
  period: string;
  category_id: string | null;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  total: number;
}

export interface TransactionTagRecord {
  id: string;
  name: string;
  color: string;
  description: string | null;
  ws_id?: string;
  amount?: number;
  transaction_count?: number;
  income_count?: number;
  expense_count?: number;
  total_income?: number;
  total_expense?: number;
  net_total?: number;
  recent_transaction_count?: number;
  recent_income_count?: number;
  recent_expense_count?: number;
  recent_total_income?: number;
  recent_total_expense?: number;
  last_transaction_at?: string | null;
}

export interface TransactionTagStatsRecord {
  tag_id: string;
  tag_name: string;
  tag_color: string;
  tag_description?: string | null;
  ws_id?: string;
  total_amount?: number;
  transaction_count: number;
  income_count: number;
  expense_count: number;
  total_income: number;
  total_expense: number;
  net_total: number;
  recent_transaction_count: number;
  recent_income_count: number;
  recent_expense_count: number;
  recent_total_income: number;
  recent_total_expense: number;
  last_transaction_at: string | null;
}

export interface TransactionTagPayload {
  name: string;
  color: string;
  description?: string | null;
}

export interface TransactionTagLinkRecord {
  tag_id: string;
}

export type FinanceFilterUserType =
  | 'all'
  | 'transaction_creators'
  | 'invoice_creators';

export type FinanceFilterUsersQuery = InternalApiQuery & {
  type?: FinanceFilterUserType;
};

export interface FinanceTransferPayload {
  origin_wallet_id: string;
  destination_wallet_id: string;
  amount: number;
  destination_amount?: number;
  description?: string;
  taken_at: string | Date;
  report_opt_in: boolean;
  tag_ids?: string[];
}

export interface FinanceTransferUpdatePayload extends FinanceTransferPayload {
  origin_transaction_id: string;
  destination_transaction_id: string;
}

export interface FinanceTransferResponse {
  message: string;
  from_transaction_id?: string;
  to_transaction_id?: string;
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

export type MoneyLoverTransactionImportRow = {
  id: string;
  date: string;
  category: string;
  amount: string;
  currency: string;
  note: string;
  wallet: string;
};

export type ListTransactionsQuery = {
  page?: string | number;
  itemsPerPage?: string | number;
};

export type FinanceInvoicesQuery = {
  customerIds?: string[];
  end?: string;
  page?: number | string;
  pageSize?: number | string;
  q?: string;
  start?: string;
  userIds?: string[];
  walletIds?: string[];
};

export interface FinanceInvoicesResponse {
  count: number;
  data: Invoice[];
}

export interface InvoiceAnalyticsResponseDateRange {
  walletData: InvoiceTotalsByGroup[];
  creatorData: InvoiceTotalsByGroup[];
  hasDateRange: true;
  startDate: string;
  endDate: string;
}

export interface InvoiceAnalyticsResponseDefault {
  dailyWalletData: InvoiceTotalsByGroup[];
  weeklyWalletData: InvoiceTotalsByGroup[];
  monthlyWalletData: InvoiceTotalsByGroup[];
  dailyCreatorData: InvoiceTotalsByGroup[];
  weeklyCreatorData: InvoiceTotalsByGroup[];
  monthlyCreatorData: InvoiceTotalsByGroup[];
  hasDateRange: false;
}

export type InvoiceAnalyticsResponse =
  | InvoiceAnalyticsResponseDateRange
  | InvoiceAnalyticsResponseDefault;

export type InvoiceAnalyticsQuery = InvoiceAnalyticsFilters & {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export interface FinanceInvoiceProductPayload {
  category_id?: string;
  price: number;
  product_id: string;
  quantity: number;
  unit_id: string;
  warehouse_id: string;
}

export interface CreateFinanceInvoicePayload {
  category_id?: string;
  content: string;
  customer_id?: string | null;
  frontend_discount_amount?: number;
  frontend_subtotal?: number;
  frontend_total?: number;
  notes?: string;
  products: FinanceInvoiceProductPayload[];
  promotion_id?: string;
  wallet_id: string;
}

export interface CreateSubscriptionFinanceInvoicePayload
  extends CreateFinanceInvoicePayload {
  customer_id: string;
  group_ids: string[];
  selected_month: string;
}

export interface FinanceInvoiceMutationResponse {
  data?: {
    calculated_values: {
      discount_amount: number;
      rounding_applied: number;
      subtotal: number;
      total: number;
    };
    category_id?: string | null;
    customer_id?: string | null;
    discount_amount?: number;
    frontend_values?: {
      discount_amount?: number;
      subtotal?: number;
      total?: number;
    };
    group_ids?: string[];
    id?: string;
    products_count?: number;
    selected_month?: string;
    subtotal?: number;
    total?: number;
    values_recalculated?: boolean;
  };
  invoice_id: string;
  message: string;
}

export interface UpdateFinanceInvoicePayload {
  note?: string | null;
  notice?: string | null;
  wallet_id?: string | null;
}

export type PendingFinanceInvoicesQuery = {
  groupByUser?: boolean;
  page?: number | string;
  pageSize?: number | string;
  q?: string;
  userIds?: string[];
};

export interface PendingFinanceInvoicesResponse {
  count: number;
  data: PendingInvoice[];
}

export interface SubscriptionInvoiceContextQuery {
  groupIds: string[];
  month: string;
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

function buildFinanceInvoicesSearchParams(query: FinanceInvoicesQuery) {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set('q', query.q);
  if (query.page) searchParams.set('page', String(query.page));
  if (query.pageSize) searchParams.set('pageSize', String(query.pageSize));
  if (query.start) searchParams.set('start', query.start);
  if (query.end) searchParams.set('end', query.end);

  appendFinanceArrayParam(searchParams, 'userIds', query.userIds);
  appendFinanceArrayParam(searchParams, 'customerIds', query.customerIds);
  appendFinanceArrayParam(searchParams, 'walletIds', query.walletIds);

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildInvoiceAnalyticsSearchParams(query: InvoiceAnalyticsQuery) {
  const searchParams = new URLSearchParams();

  appendFinanceArrayParam(searchParams, 'walletIds', query.walletIds);
  appendFinanceArrayParam(searchParams, 'userIds', query.userIds);

  if (query.startDate) searchParams.set('start', query.startDate);
  if (query.endDate) searchParams.set('end', query.endDate);
  if (query.granularity) searchParams.set('granularity', query.granularity);
  if (query.weekStartsOn !== undefined) {
    searchParams.set('weekStartsOn', String(query.weekStartsOn));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildPendingFinanceInvoicesSearchParams(
  query: PendingFinanceInvoicesQuery & { currentMonthOnly?: boolean }
) {
  const searchParams = new URLSearchParams();

  if (query.page) searchParams.set('page', String(query.page));
  if (query.pageSize) searchParams.set('pageSize', String(query.pageSize));
  if (query.q) searchParams.set('q', query.q);
  if (query.groupByUser !== undefined) {
    searchParams.set('groupByUser', String(query.groupByUser));
  }
  if (query.currentMonthOnly !== undefined) {
    searchParams.set('currentMonthOnly', String(query.currentMonthOnly));
  }

  appendFinanceArrayParam(searchParams, 'userIds', query.userIds);

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildSubscriptionInvoiceContextSearchParams(
  query: SubscriptionInvoiceContextQuery
) {
  const searchParams = new URLSearchParams({
    month: query.month,
    userId: query.userId,
  });

  appendFinanceArrayParam(searchParams, 'groupIds', query.groupIds);

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

export async function listFinanceInvoices(
  workspaceId: string,
  query: FinanceInvoicesQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceInvoicesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices${buildFinanceInvoicesSearchParams(query)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createFinanceInvoice(
  workspaceId: string,
  payload: CreateFinanceInvoicePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceInvoiceMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices`,
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

export async function getInvoiceAnalytics(
  workspaceId: string,
  query: InvoiceAnalyticsQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InvoiceAnalyticsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/analytics${buildInvoiceAnalyticsSearchParams(query)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createSubscriptionFinanceInvoice(
  workspaceId: string,
  payload: CreateSubscriptionFinanceInvoicePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceInvoiceMutationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/subscription`,
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

export async function updateFinanceInvoice(
  workspaceId: string,
  invoiceId: string,
  payload: UpdateFinanceInvoicePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/${encodePathSegment(invoiceId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
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

export async function listPendingFinanceInvoices(
  workspaceId: string,
  query: PendingFinanceInvoicesQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<PendingFinanceInvoicesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/pending${buildPendingFinanceInvoicesSearchParams(query)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getPendingFinanceInvoicesCurrentMonthCount(
  workspaceId: string,
  query: Pick<PendingFinanceInvoicesQuery, 'groupByUser'> = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<number>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/pending${buildPendingFinanceInvoicesSearchParams(
      {
        ...query,
        currentMonthOnly: true,
      }
    )}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getSubscriptionInvoiceContext(
  workspaceId: string,
  query: SubscriptionInvoiceContextQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SubscriptionInvoiceContextResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/subscription/context${buildSubscriptionInvoiceContextSearchParams(query)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listDebtLoans(
  workspaceId: string,
  query: DebtLoanListQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DebtLoanWithBalance[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function getDebtLoanSummary(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DebtLoanSummary>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts/summary`,
    {
      cache: 'no-store',
    }
  );
}

export async function getDebtLoan(
  workspaceId: string,
  debtLoanId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DebtLoanWithBalance>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts/${encodePathSegment(debtLoanId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createDebtLoan(
  workspaceId: string,
  payload: DebtLoanFormData,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DebtLoanWithBalance>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts`,
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

export async function updateDebtLoan(
  workspaceId: string,
  debtLoanId: string,
  payload: DebtLoanPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<DebtLoanWithBalance>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts/${encodePathSegment(debtLoanId)}`,
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

export async function deleteDebtLoan(
  workspaceId: string,
  debtLoanId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/debts/${encodePathSegment(debtLoanId)}`,
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

export async function createTransfer(
  workspaceId: string,
  payload: FinanceTransferPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceTransferResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transfers`,
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

export async function updateTransfer(
  workspaceId: string,
  payload: FinanceTransferUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceTransferResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transfers`,
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

export async function listTransactionTags(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionTagRecord[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/tags`,
    {
      cache: 'no-store',
    }
  );
}

export async function listTransactionTagLinks(
  workspaceId: string,
  transactionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionTagLinkRecord[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/transactions/${encodePathSegment(transactionId)}/tags`,
    {
      cache: 'no-store',
    }
  );
}

export async function listTransactionTagStats(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionTagStatsRecord[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/tags/stats`,
    {
      cache: 'no-store',
    }
  );
}

export async function createTransactionTag(
  workspaceId: string,
  payload: TransactionTagPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionTagRecord>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/tags`,
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

export async function updateTransactionTag(
  workspaceId: string,
  tagId: string,
  payload: TransactionTagPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TransactionTagRecord>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/tags/${encodePathSegment(tagId)}`,
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

export async function deleteTransactionTag(
  workspaceId: string,
  tagId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message?: string }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/tags/${encodePathSegment(tagId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listFinanceFilterUsers(
  workspaceId: string,
  query: FinanceFilterUsersQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ users: WorkspaceUser[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/filter-users`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.users ?? [];
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

export async function importMoneyLoverTransactions(
  workspaceId: string,
  transactions: MoneyLoverTransactionImportRow[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
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
  const payload = await client.json<{
    upcomingTransactions: UpcomingRecurringTransactionRecord[];
  }>(
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

export async function listFinanceDailyIncomeExpense(
  workspaceId: string,
  query: FinanceChartRangeQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ data: FinanceDailyIncomeExpensePoint[] }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/finance/charts/daily`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.data ?? [];
}

export async function listFinanceMonthlyIncomeExpense(
  workspaceId: string,
  query: FinanceChartRangeQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    data: FinanceMonthlyIncomeExpensePoint[];
  }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/finance/charts/monthly`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.data ?? [];
}

export async function getFinanceBalanceAtDate(
  workspaceId: string,
  query: FinanceBalanceAtDateQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<FinanceBalanceAtDate>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/finance/charts/balance`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function listFinanceCategoryBreakdown(
  workspaceId: string,
  query: FinanceCategoryBreakdownQuery = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ data: FinanceCategoryBreakdownPoint[] }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/finance/charts/categories`,
    {
      query,
      cache: 'no-store',
    }
  );

  return payload.data ?? [];
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
