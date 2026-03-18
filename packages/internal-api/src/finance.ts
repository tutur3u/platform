import type {
  FinanceBudget,
  FinanceBudgetStatus,
  Wallet,
} from '@tuturuuu/types';
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

export async function getWallet(
  workspaceId: string,
  walletId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Wallet>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/wallets/${encodePathSegment(walletId)}`,
    {
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
