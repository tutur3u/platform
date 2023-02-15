import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode, useState } from 'react';
import { Wallet } from '../types/primitives/Wallet';
import { Transaction } from '../types/primitives/Transaction';
import { showNotification } from '@mantine/notifications';

const WalletContext = createContext({
  isWalletsLoading: false,
  wallets: [] as Wallet[],

  isTransactionsLoading: false,
  transactions: [] as Transaction[],

  walletId: null as string | null,
  setWalletId: (id: string | null) => console.log(id),

  projectId: null as string | string[] | null,
  setProjectId: (id: string | null) => console.log(id),

  createWallet: (projectId: string | string[], wallet: Wallet) =>
    console.log(projectId, wallet),
  updateWallet: (projectId: string | string[], wallet: Wallet) =>
    console.log(projectId, wallet),
  deleteWallet: (wallet: Wallet) => console.log(wallet),
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);

  const { data: wallets, error: walletsError } = useSWR(
    projectId ? `/api/projects/${projectId}/wallets` : null
  );

  const isWalletsLoading = !wallets && !walletsError;

  const { data: transactions, error: transactionsError } = useSWR(
    projectId && walletId
      ? `/api/projects/${projectId}/wallets/${walletId}/transactions`
      : null
  );

  const isTransactionsLoading = !transactions && !transactionsError;

  const createWallet = async (projectId: string | string[], wallet: Wallet) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/wallets`, {
        method: 'POST',
        body: JSON.stringify({
          name: wallet?.name || '',
          description: wallet?.description || '',
          currency: wallet?.currency || '',
          balance: wallet?.balance || 0,
        }),
      });

      if (!res.ok) throw new Error('Failed to create wallet');
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to create wallet',
        message: 'Make sure you have permission to create new wallets',
        color: 'red',
      });
    }
  };

  const updateWallet = async (projectId: string | string[], wallet: Wallet) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${wallet.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: wallet?.name || '',
            description: wallet?.description || '',
            currency: wallet?.currency || '',
            balance: wallet?.balance || 0,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update wallet');
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to update wallet',
        message: 'Make sure you have permission to update wallets',
        color: 'red',
      });
    }
  };

  const deleteWallet = async (wallet: Wallet) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${wallet.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete wallet');
      mutate(`/api/projects/${projectId}/wallets`);
    } catch (e: any) {
      showNotification({
        title: 'Failed to delete wallet',
        message: 'Make sure you have permission to delete wallets',
        color: 'red',
      });
    }
  };

  const values = {
    isWalletsLoading,
    wallets,

    isTransactionsLoading,
    transactions,

    walletId,
    setWalletId,

    projectId,
    setProjectId,

    createWallet,
    updateWallet,
    deleteWallet,
  };

  return (
    <WalletContext.Provider value={values}>{children}</WalletContext.Provider>
  );
};

export const useWallets = () => {
  const context = useContext(WalletContext);

  if (context === undefined)
    throw new Error(`useWallets() must be used within a WalletProvider.`);

  return context;
};
