import useSWR, { mutate } from 'swr';

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';
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
  setProjectId: (id: string | null) => console.log(id),
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

  const createWallet = async (wallet: Wallet) => {
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
      mutate('/api/orgs');
    } catch (e: any) {
      showNotification({
        title: 'Failed to create organization',
        message: 'Make sure you have permission to create new organizations',
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
    setProjectId,
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
