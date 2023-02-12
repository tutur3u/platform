import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode, useState } from 'react';
import { Wallet } from '../types/primitives/Wallet';
import { Transaction } from '../types/primitives/Transaction';
import { showNotification } from '@mantine/notifications';

const TransactionContext = createContext({
  isTransactionsLoading: false,
  transactions: [] as Transaction[],

  isWalletsLoading: false,
  wallets: [] as Wallet[],

  transactionId: null as string | null,
  setTransactionId: (id: string | null) => console.log(id),

  walletId: null as string | null,
  setWalletId: (id: string | null) => console.log(id),

  createTransaction: (walletId: string, transaction: Transaction) =>
    console.log(transaction),
  updateTransaction: (walletId: string, transaction: Transaction) =>
    console.log(transaction),
  deleteTransaction: (transaction: Transaction) => console.log(transaction),
});

export const TransactionProvider = ({ children }: { children: ReactNode }) => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  const { data: wallets, error: walletsError } = useSWR(
    projectId ? `/api/projects/${projectId}/wallets` : null
  );

  const isWalletsLoading = !wallets && !walletsError;

  const { data: transactions, error: transactionsError } = useSWR(
    projectId && walletId
      ? `/api/projects/${projectId}/wallets/${walletId}/transactions/`
      : null
  );

  const isTransactionsLoading = !transactions && !transactionsError;

  const createTransaction = async (
    walletId: string,
    transaction: Transaction
  ) => {
    transaction.amount =
      transaction.type === 'income'
        ? transaction.amount
        : transaction.amount * -1;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${walletId}/transactions`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: transaction?.name || '',
            description: transaction?.description || '',
            amount: transaction?.amount || 0,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to create transaction');
      mutate(`/api/projects/${projectId}/wallets/${walletId}/transactions`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to create transaction',
        message: 'Make sure you have permission to create new transactions',
        color: 'red',
      });
    }
  };

  const updateTransaction = async (
    walletId: string,
    transaction: Transaction
  ) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${walletId}/transactions/${transaction.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: transaction?.name || '',
            description: transaction?.description || '',
            amount: transaction?.amount || 0,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update transaction');
      mutate(`/api/projects/${projectId}/wallets/${walletId}/transactions`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to update transaction',
        message: 'Make sure you have permission to update transactions',
        color: 'red',
      });
    }
  };

  const deleteTransaction = async (transaction: Transaction) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${walletId}/transactions/${transaction.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete transaction');
      mutate(`/api/projects/${projectId}/wallets/${walletId}/transactions`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to delete transaction',
        message: 'Make sure you have permission to delete transactions',
        color: 'red',
      });
    }
  };

  const values = {
    isTransactionsLoading,
    transactions,

    wallets,
    isWalletsLoading,

    transactionId,
    setTransactionId,

    walletId,
    setWalletId,

    createTransaction,
    updateTransaction,
    deleteTransaction,
  };

  return (
    <TransactionContext.Provider value={values}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);

  if (context === undefined)
    throw new Error(
      `useTransactions() must be used within a TransactionProvider.`
    );

  return context;
};
