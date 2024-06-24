import { CustomDataTable } from '@/components/custom-data-table';
import { promotionColumns } from '@/data/columns/promotions';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={promotionColumns}
      namespace="promotion-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
