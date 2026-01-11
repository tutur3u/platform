'use client';

import { UserFilter } from '@tuturuuu/ui/finance/transactions/user-filter';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface UserFilterWrapperProps {
  wsId: string;
}

export function UserFilterWrapper({ wsId }: UserFilterWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Get current user IDs from search params
  const currentUserIds = searchParams.getAll('userIds');

  // Handle user filter changes
  const handleUsersChange = useCallback(
    (userIds: string[]) => {
      const params = new URLSearchParams(searchParams);

      // Remove all existing userIds params
      params.delete('userIds');

      // Add new userIds params
      if (userIds.length > 0) {
        userIds.forEach((userId) => {
          params.append('userIds', userId);
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
    <UserFilter
      wsId={wsId}
      selectedUserIds={currentUserIds}
      onUsersChange={handleUsersChange}
      filterType="invoice_creators"
    />
  );
}
