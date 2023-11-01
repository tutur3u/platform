import { DataTable } from '@/components/ui/custom/tables/data-table';
import { transactionCategoryColumns } from '@/data/columns/transaction-categories';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={transactionCategoryColumns}
      namespace="transaction-category-data-table"
      defaultVisibility={{
        id: false,
        created_at: false,
      }}
    />
  );
}
