import { DataTable } from '@/components/ui/custom/tables/data-table';
import { promotionColumns } from '@/data/columns/promotions';

export default function Loading() {
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
