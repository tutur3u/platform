import { CustomDataTable } from '@/components/custom-data-table';
import { batchColumns } from '@/data/columns/batches';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={batchColumns}
      namespace="batch-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
