import { batchColumns } from '@/data/columns/batches';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';

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
