'use client';

import { UserFilter } from '@tuturuuu/ui/finance/transactions/user-filter';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from 'nuqs';
import { useFilterReset } from './hooks/use-filter-reset';

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

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle user filter changes
  const handleUsersChange = useFilterReset(setUserIds, setPage);

  return (
    <UserFilter
      wsId={wsId}
      selectedUserIds={currentUserIds}
      onUsersChange={handleUsersChange}
      filterType="transaction_creators"
    />
  );
}
