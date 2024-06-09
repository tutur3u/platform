import { DataTable } from '@/components/ui/custom/tables/data-table';
import { productColumns } from '@/data/columns/products';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={productColumns}
      namespace="product-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
