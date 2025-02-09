import { getPromotionColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';

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
