import { CustomDataTable } from '@/components/custom-data-table';
import { productColumns } from './columns';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={productColumns}
      namespace="product-data-table"
      defaultVisibility={{
        id: false,
        manufacturer: false,
        usage: false,
        created_at: false,
      }}
    />
  );
}
