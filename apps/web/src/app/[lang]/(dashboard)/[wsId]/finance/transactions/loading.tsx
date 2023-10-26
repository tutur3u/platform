import { DataTable } from '@/components/ui/custom/tables/data-table';
import { transactionColumns } from '@/data/columns/transactions';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={transactionColumns}
      namespace="transaction-data-table"
      defaultVisibility={{
        id: false,
        report_opt_in: false,
        taken_at: false,
      }}
    />
  );
}
