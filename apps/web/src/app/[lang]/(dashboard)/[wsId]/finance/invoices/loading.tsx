import { invoiceColumns } from '@/data/columns/invoices';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={invoiceColumns}
      namespace="invoice-data-table"
      defaultVisibility={{
        id: false,
        customer_id: false,
        price: false,
        total_diff: false,
        note: false,
        created_at: false,
      }}
    />
  );
}
