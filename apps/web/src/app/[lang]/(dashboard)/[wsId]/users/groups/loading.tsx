import { getUserGroupColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';

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
