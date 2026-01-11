'use client';

import { WalletFilter } from '@tuturuuu/ui/finance/transactions/wallet-filter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface WalletFilterWrapperProps {
  wsId: string;
}

export function WalletFilterWrapper({ wsId }: WalletFilterWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current wallet IDs from search params
  const currentWalletIds = searchParams.getAll('walletIds');

  // Handle wallet filter changes
  const handleWalletsChange = useCallback(
    (walletIds: string[]) => {
      const params = new URLSearchParams(searchParams);

      // Remove all existing walletIds params
      params.delete('walletIds');
      // Remove legacy walletId param if exists
      params.delete('walletId');

      // Add new walletIds params
      if (walletIds.length > 0) {
        walletIds.forEach((walletId) => {
          params.append('walletIds', walletId);
        });
      }

      // Reset to first page when filtering
      params.set('page', '1');

      const newUrl = `${pathname}?${params.toString()}`;
      router.push(newUrl);
      router.refresh();
    },
    [router, searchParams, pathname]
  );

  return (
    <WalletFilter
      wsId={wsId}
      selectedWalletIds={currentWalletIds}
      onWalletsChange={handleWalletsChange}
    />
  );
}
