import { getUserReportColumns } from '@/data/columns/user-reports';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { getReports } from './core';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WorkspaceUserReportsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data, count } = await getReports(wsId, searchParams);

  return (
    <DataTable
      data={data}
      columnGenerator={getUserReportColumns}
      namespace="user-report-data-table"
      count={count}
      defaultVisibility={{
        id: false,
        user_id: false,
        created_at: false,
      }}
    />
  );
}
