'use client';

import { UserFilter } from '@tuturuuu/ui/finance/transactions/user-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useCallback } from 'react';

interface UserFilterWrapperProps {
  wsId: string;
  invoiceType?: 'created' | 'pending';
  availableUsers?: Array<{
    id: string;
    display_name: string;
    avatar_url?: string;
  }>;
}

export function UserFilterWrapper({
  wsId,
  invoiceType = 'created',
  availableUsers,
}: UserFilterWrapperProps) {
  const [userIds, setUserIds] = useQueryState(
    'userIds',
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

  // Handle user filter changes
  const handleUsersChange = useCallback(
    (newIds: string[]) => {
      setUserIds(newIds.length > 0 ? newIds : null);
      setPage(1); // Reset to first page when filtering
    },
    [setUserIds, setPage]
  );

  return (
    <UserFilter
      wsId={wsId}
      selectedUserIds={userIds}
      onUsersChange={handleUsersChange}
      filterType={invoiceType === 'created' ? 'invoice_creators' : 'all'}
      availableUsers={availableUsers}
    />
  );
}
