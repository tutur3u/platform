import { getUserReportColumns } from '@/data/columns/user-reports';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export default function Loading() {
  return (
    <DataTable
      columnGenerator={getUserReportColumns}
      namespace="user-report-data-table"
      defaultVisibility={{
        id: false,
        user_id: false,
        created_at: false,
      }}
    />
  );
}
