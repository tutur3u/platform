import { DataTable } from '@/components/ui/custom/tables/data-table';
import { batchColumns } from '@/data/columns/batches';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={batchColumns}
      namespace="batch-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
