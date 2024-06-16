import { CustomDataTable } from '@/components/custom-data-table';
import { basicColumns } from '@/data/columns/basic';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={basicColumns}
      namespace="basic-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
