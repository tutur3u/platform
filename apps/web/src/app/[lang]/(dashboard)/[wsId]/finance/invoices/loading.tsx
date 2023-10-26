import { DataTable } from '@/components/ui/custom/tables/data-table';
import { invoiceColumns } from '@/data/columns/invoices';

export default async function Loading() {
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
