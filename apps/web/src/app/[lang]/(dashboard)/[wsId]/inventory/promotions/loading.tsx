import { promotionColumns } from '@/data/columns/promotions';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default async function Loading() {
  return (
    <DataTable
      columnGenerator={promotionColumns}
      namespace="promotion-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
