'use client';

import { WalletFilter } from '@tuturuuu/ui/finance/transactions/wallet-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useFilterReset } from './hooks/use-filter-reset';

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

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle wallet filter changes
  const handleWalletsChange = useFilterReset(setWalletIds, setPage);

  return (
    <WalletFilter
      wsId={wsId}
      selectedWalletIds={currentWalletIds}
      onWalletsChange={handleWalletsChange}
    />
  );
}
