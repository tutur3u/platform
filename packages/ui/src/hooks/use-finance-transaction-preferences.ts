'use client';

import { useMemo } from 'react';
import { useLocalStorage } from './use-local-storage';
import { useUserBooleanConfig } from './use-user-config';

export const REMEMBER_FINANCE_TRANSACTION_SELECTIONS_CONFIG_KEY =
  'REMEMBER_FINANCE_TRANSACTION_SELECTIONS';

export interface FinanceTransactionSelections {
  walletId?: string;
  categoryId?: string;
  updatedAt?: string;
}

export function getFinanceTransactionSelectionsStorageKey(wsId: string) {
  return `finance-transaction-selections:${wsId}`;
}

export function useFinanceTransactionPreferences(wsId: string) {
  const {
    value: rememberLastSelections,
    isLoading: isLoadingRememberLastSelections,
    setValue: setRememberLastSelections,
    isPending: isPendingRememberLastSelections,
  } = useUserBooleanConfig(
    REMEMBER_FINANCE_TRANSACTION_SELECTIONS_CONFIG_KEY,
    true
  );

  const storageKey = useMemo(
    () => getFinanceTransactionSelectionsStorageKey(wsId),
    [wsId]
  );

  const [lastSelections, setLastSelections, isLastSelectionsInitialized] =
    useLocalStorage<FinanceTransactionSelections>(storageKey, {});

  const saveLastSelections = (
    nextSelections: Partial<FinanceTransactionSelections>
  ) => {
    setLastSelections((previousSelections) => ({
      ...previousSelections,
      ...nextSelections,
      updatedAt: new Date().toISOString(),
    }));
  };

  return {
    rememberLastSelections,
    setRememberLastSelections,
    isLoadingRememberLastSelections,
    isPendingRememberLastSelections,
    lastSelections,
    isLastSelectionsInitialized,
    saveLastSelections,
  };
}
