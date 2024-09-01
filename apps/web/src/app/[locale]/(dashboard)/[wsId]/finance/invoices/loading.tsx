import { invoiceColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';

export default function Loading() {
  return (
    <CustomDataTable
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
