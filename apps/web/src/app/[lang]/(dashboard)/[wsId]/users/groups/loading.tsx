import { CustomDataTable } from '@/components/custom-data-table';
import { getUserGroupColumns } from '@/data/columns/user-groups';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={getUserGroupColumns}
      namespace="user-group-data-table"
      defaultVisibility={{
        id: false,
        locked: false,
        created_at: false,
      }}
    />
  );
}
