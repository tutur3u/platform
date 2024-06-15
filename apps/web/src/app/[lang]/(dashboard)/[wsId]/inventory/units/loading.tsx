import { basicColumns } from '@/data/columns/basic';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={basicColumns}
      namespace="basic-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
