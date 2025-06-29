'use client';

import type {
  PlatformUser,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPlatformRoleColumns } from './columns';

// Create a compatible type that merges the search result with required User fields
type PlatformUserWithDetails = Omit<User, 'services'> &
  PlatformUser &
  Partial<UserPrivateDetails> & {
    services?: User['services']; // Make services optional since RPC doesn't return it
  };

interface PlatformRolesTableProps {
  data: PlatformUserWithDetails[];
  count: number;
  locale: string;
}

export default function PlatformRolesTable({
  data,
  count,
  locale,
}: PlatformRolesTableProps) {
  return (
    <CustomDataTable
      data={data}
      columnGenerator={getPlatformRoleColumns}
      count={count}
      extraData={{ locale }}
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
      disableSearch
    />
  );
}
