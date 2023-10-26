import { DataTable } from '@/components/ui/custom/tables/data-table';
import { walletColumns } from '@/data/columns/wallets';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={walletColumns}
      namespace="wallet-data-table"
      defaultVisibility={{
        id: false,
        description: false,
        report_opt_in: false,
        created_at: false,
      }}
    />
  );
}
