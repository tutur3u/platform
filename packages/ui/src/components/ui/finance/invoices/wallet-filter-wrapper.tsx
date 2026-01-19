'use client';

import { WalletFilter } from '@tuturuuu/ui/finance/transactions/wallet-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useCallback } from 'react';

interface WalletFilterWrapperProps {
  wsId: string;
}

export function WalletFilterWrapper({ wsId }: WalletFilterWrapperProps) {
  const [walletIds, setWalletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle wallet filter changes
  const handleWalletsChange = useCallback(
    (newIds: string[]) => {
      setWalletIds(newIds.length > 0 ? newIds : null);
      setPage(1); // Reset to first page when filtering
    },
    [setWalletIds, setPage]
  );

  return (
    <WalletFilter
      wsId={wsId}
      selectedWalletIds={walletIds}
      onWalletsChange={handleWalletsChange}
    />
  );
}
