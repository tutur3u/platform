import { promotionColumns } from '@/data/columns/promotions';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';

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
