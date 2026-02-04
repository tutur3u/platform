import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type DateRange,
  queryKeys,
  type TransactionFilters,
} from '@/lib/query';
import { supabase } from '@/lib/supabase';

// Explicit types for finance data
// Explicit types for finance data
export type TransactionCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  ws_id: string; // Add ws_id if needed, trying to match DB
};

export type FinanceWallet = {
  id: string;
  name: string;
  currency: string | null;
  balance: number | null;
  ws_id: string;
  created_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  amount: number;
  description: string | null;
  category_id: string | null;
  taken_at: string;
  wallet?: FinanceWallet | null;
  category?: TransactionCategory | null;
};

/**
 * Fetch transactions for a workspace with optional filters
 */
export function useTransactions(
  wsId: string | undefined,
  filters?: TransactionFilters
) {
  return useQuery<WalletTransaction[]>({
    queryKey: queryKeys.finance.transactions(wsId ?? '', filters),
    queryFn: async () => {
      if (!wsId) return [];

      // Simple query without complex joins
      let query = supabase
        .from('wallet_transactions')
        .select('*')
        .order('taken_at', { ascending: false });

      // Apply filters
      if (filters?.walletId) {
        query = query.eq('wallet_id', filters.walletId);
      }
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      if (filters?.startDate) {
        query = query.gte('taken_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('taken_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as WalletTransaction[];
    },
    enabled: !!wsId,
  });
}

/**
 * Fetch a single transaction by ID
 */
export function useTransaction(
  wsId: string | undefined,
  transactionId: string | undefined
) {
  return useQuery<WalletTransaction | null>({
    queryKey: queryKeys.finance.transaction(wsId ?? '', transactionId ?? ''),
    queryFn: async () => {
      if (!wsId || !transactionId) return null;

      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as WalletTransaction;
    },
    enabled: !!wsId && !!transactionId,
  });
}

/**
 * Fetch wallets for a workspace
 */
export function useWallets(wsId: string | undefined) {
  return useQuery<FinanceWallet[]>({
    queryKey: queryKeys.finance.wallets(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];

      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as FinanceWallet[];
    },
    enabled: !!wsId,
  });
}

/**
 * Fetch a single wallet by ID
 */
export function useWallet(
  wsId: string | undefined,
  walletId: string | undefined
) {
  return useQuery<FinanceWallet | null>({
    queryKey: queryKeys.finance.wallet(wsId ?? '', walletId ?? ''),
    queryFn: async () => {
      if (!wsId || !walletId) return null;

      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('*')
        .eq('id', walletId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as FinanceWallet;
    },
    enabled: !!wsId && !!walletId,
  });
}

/**
 * Fetch transaction categories for a workspace
 */
export function useTransactionCategories(wsId: string | undefined) {
  return useQuery<TransactionCategory[]>({
    queryKey: queryKeys.finance.categories(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];

      const { data, error } = await supabase
        .from('transaction_categories')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as TransactionCategory[];
    },
    enabled: !!wsId,
  });
}

/**
 * Fetch finance summary for a workspace
 */
export function useFinanceSummary(wsId: string | undefined, range?: DateRange) {
  return useQuery({
    queryKey: queryKeys.finance.summary(
      wsId ?? '',
      range ?? { start: '', end: '' }
    ),
    queryFn: async () => {
      if (!wsId) {
        return { income: 0, expenses: 0, balance: 0 };
      }

      let query = supabase
        .from('wallet_transactions')
        .select(
          `
          amount,
          wallet:finance_wallets!inner (
            ws_id
          )
        `
        )
        .eq('wallet.ws_id', wsId);

      if (range?.start) {
        query = query.gte('taken_at', range.start);
      }
      if (range?.end) {
        query = query.lte('taken_at', range.end);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      const transactions = data ?? [];
      const income = transactions
        .filter((t) => (t.amount ?? 0) > 0)
        .reduce((sum, t) => sum + (t.amount ?? 0), 0);
      const expenses = transactions
        .filter((t) => (t.amount ?? 0) < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount ?? 0), 0);

      return {
        income,
        expenses,
        balance: income - expenses,
      };
    },
    enabled: !!wsId,
  });
}

/**
 * Finance mutation hooks
 */
export function useFinanceMutations(wsId: string) {
  const queryClient = useQueryClient();

  const createTransaction = useMutation({
    mutationFn: async (transaction: {
      wallet_id: string;
      amount: number;
      description?: string;
      category_id?: string;
      taken_at?: string;
    }) => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: transaction.wallet_id,
          amount: transaction.amount,
          description: transaction.description,
          category_id: transaction.category_id,
          taken_at: transaction.taken_at ?? new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.all(wsId),
      });
    },
  });

  const updateTransaction = useMutation({
    mutationFn: async ({
      transactionId,
      updates,
    }: {
      transactionId: string;
      updates: {
        amount?: number;
        description?: string;
        category_id?: string;
        taken_at?: string;
      };
    }) => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .update(updates)
        .eq('id', transactionId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transaction(wsId, variables.transactionId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.all(wsId),
      });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from('wallet_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.all(wsId),
      });
    },
  });

  return {
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
