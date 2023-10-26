import { basicColumns } from '@/data/columns/basic';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default async function Loading() {
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
