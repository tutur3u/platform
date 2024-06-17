import { CustomDataTable } from '@/components/custom-data-table';
import { productColumns } from '@/data/columns/products';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={productColumns}
      namespace="product-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
