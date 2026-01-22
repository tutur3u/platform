'use client';

import { UserFilter } from '@tuturuuu/ui/finance/transactions/user-filter';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

interface UserFilterWrapperProps {
  wsId: string;
}

export function UserFilterWrapper({ wsId }: UserFilterWrapperProps) {
  const [currentUserIds, setUserIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );
  const [, setPage] = useQueryState('page', { shallow: true });

  // Handle user filter changes
  const handleUsersChange = useCallback(
    async (userIds: string[]) => {
      await setUserIds(userIds.length > 0 ? userIds : []);
      await setPage('1');
    },
    [setUserIds, setPage]
  );

  return (
    <UserFilter
      wsId={wsId}
      selectedUserIds={currentUserIds}
      onUsersChange={handleUsersChange}
      filterType="transaction_creators"
    />
  );
}
