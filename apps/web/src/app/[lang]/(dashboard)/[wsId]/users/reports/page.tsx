import { getUserReportColumns } from '@/data/columns/user-reports';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { getReports } from './core';
import { verifyHasSecrets } from '@/lib/workspace-helper';

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
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
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
