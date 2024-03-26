import { getUserColumns } from '@/data/columns/users';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default function Loading() {
  return (
    <DataTable
      namespace="user-data-table"
      columnGenerator={getUserColumns}
      defaultVisibility={{
        id: false,
        avatar_url: false,
        ethnicity: false,
        guardian: false,
        address: false,
        national_id: false,
        note: false,
        linked_users: false,
      }}
    />
  );
}
