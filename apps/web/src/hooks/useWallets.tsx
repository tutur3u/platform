import useSWR, { mutate } from 'swr';

import { createContext, useContext, ReactNode, useState } from 'react';
import { Wallet } from '../types/primitives/Wallet';
import { Transaction } from '../types/primitives/Transaction';
import { showNotification } from '@mantine/notifications';

const WalletContext = createContext({
  createWallet: (projectId: string, wallet: Wallet) =>
    console.log(projectId, wallet),
  updateWallet: (projectId: string, wallet: Wallet) =>
    console.log(projectId, wallet),
  deleteWallet: (projectId: string, wallet: Wallet) => console.log(wallet),
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const createWallet = async (projectId: string, wallet: Wallet) => {
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

  const updateWallet = async (projectId: string, wallet: Wallet) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/wallets/${wallet.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
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

  const deleteWallet = async (projectId: string, wallet: Wallet) => {
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
