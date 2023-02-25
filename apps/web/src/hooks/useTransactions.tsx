import { mutate } from 'swr';

import { createContext, useContext, ReactNode, useState } from 'react';
import { Wallet } from '../types/primitives/Wallet';
import { Transaction } from '../types/primitives/Transaction';
import { showNotification } from '@mantine/notifications';

const TransactionContext = createContext({
  createTransaction: (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => console.log(transaction),
  updateTransaction: (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => console.log(transaction),
  deleteTransaction: (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => console.log(transaction),
});

export const TransactionProvider = ({ children }: { children: ReactNode }) => {
  const createTransaction = async (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => {
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
      mutate(`/api/projects/${projectId}/wallets/${walletId}`);
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to create transaction',
        message: 'Make sure you have permission to create new transactions',
        color: 'red',
      });
    }
  };

  const updateTransaction = async (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${walletId}/transactions/${transaction.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: transaction?.name || '',
            description: transaction?.description || '',
            amount: transaction?.amount || 0,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update transaction');
      mutate(`/api/projects/${projectId}/wallets/${walletId}/transactions`);
      mutate(`/api/projects/${projectId}/wallets/${walletId}`);
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to update transaction',
        message: 'Make sure you have permission to update transactions',
        color: 'red',
      });
    }
  };

  const deleteTransaction = async (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${walletId}/transactions/${transaction.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete transaction');
      mutate(`/api/projects/${projectId}/wallets/${walletId}/transactions`);
      mutate(`/api/projects/${projectId}/wallets/${walletId}`);
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to delete transaction',
        message: 'Make sure you have permission to delete transactions',
        color: 'red',
      });
    }
  };
  const values = {
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
