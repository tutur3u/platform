'use client';

import { WalletFilter } from '@tuturuuu/ui/finance/transactions/wallet-filter';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

interface WalletFilterWrapperProps {
  wsId: string;
}

export function WalletFilterWrapper({ wsId }: WalletFilterWrapperProps) {
  const [currentWalletIds, setWalletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [, setPage] = useQueryState('page', { shallow: true });

  // Handle wallet filter changes
  const handleWalletsChange = useCallback(
    async (walletIds: string[]) => {
      await setWalletIds(walletIds.length > 0 ? walletIds : []);
      await setPage('1');
    },
    [setWalletIds, setPage]
  );

  return (
    <WalletFilter
      wsId={wsId}
      selectedWalletIds={currentWalletIds}
      onWalletsChange={handleWalletsChange}
    />
  );
}
