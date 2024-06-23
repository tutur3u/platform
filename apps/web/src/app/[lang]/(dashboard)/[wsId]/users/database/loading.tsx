import { getUserColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';

export default function Loading() {
  return (
    <CustomDataTable
      namespace="user-data-table"
      columnGenerator={getUserColumns}
      defaultVisibility={{
        id: false,
        gender: false,
        avatar_url: false,
        display_name: false,
        ethnicity: false,
        guardian: false,
        address: false,
        national_id: false,
        note: false,
        linked_users: false,
        created_at: false,
        updated_at: false,
      }}
    />
  );
}
