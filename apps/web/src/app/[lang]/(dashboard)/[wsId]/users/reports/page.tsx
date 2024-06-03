import { getUserReportColumns } from '@/data/columns/user-reports';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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
  const { data, count } = await getData(wsId, searchParams);

  const reports =
    data?.map((rp) => ({
      ...rp,
      href: `/${wsId}/users/reports/${rp.id}`,
    })) ?? [];

  return (
    <DataTable
      data={reports}
      columnGenerator={getUserReportColumns}
      namespace="user-report-data-table"
      count={count ?? undefined}
      defaultVisibility={{
        id: false,
        user_id: false,
        created_at: false,
      }}
    />
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean }
) {
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .from('external_user_monthly_reports')
    .select(
      '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name)',
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('user.full_name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;

  const data = rawData?.map((row) => ({
    user_name: row.user.full_name,
    creator_name: row.creator.full_name,
    ...row,
  }));

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count };
}
