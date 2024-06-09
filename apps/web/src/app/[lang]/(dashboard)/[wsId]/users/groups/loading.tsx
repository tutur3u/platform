import { DataTable } from '@/components/ui/custom/tables/data-table';
import { getUserGroupColumns } from '@/data/columns/user-groups';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={getUserGroupColumns}
      namespace="user-group-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
