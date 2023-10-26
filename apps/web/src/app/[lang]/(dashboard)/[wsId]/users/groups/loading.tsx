import { getUserGroupColumns } from '@/data/columns/user-groups';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default async function Loading() {
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
