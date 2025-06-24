import { CustomDataTable } from '@/components/custom-data-table';
import { getPromotionColumns } from './columns';

export default function Loading() {
  return (
    <CustomDataTable
      columnGenerator={getPromotionColumns}
      namespace="promotion-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
