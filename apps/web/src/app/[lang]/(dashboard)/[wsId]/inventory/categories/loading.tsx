import { DataTable } from '@/components/ui/custom/tables/data-table';
import { basicColumns } from '@/data/columns/basic';

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
