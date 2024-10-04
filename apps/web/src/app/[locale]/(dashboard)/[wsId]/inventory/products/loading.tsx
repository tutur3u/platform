import { productColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';

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
