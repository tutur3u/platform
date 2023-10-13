import { UserGroup } from '@/types/primitives/UserGroup';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { getUserGroupColumns } from '@/data/columns/user-groups';
import { DataTable } from '@/components/ui/custom/tables/data-table';

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

export default async function WorkspaceUserGroupsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data, count } = await getData(wsId, searchParams);

  return (
    <DataTable
      data={data}
      columnGenerator={getUserGroupColumns}
      namespace="user-group-data-table"
      count={count}
      defaultVisibility={{
        id: false,
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
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (
    page &&
    pageSize &&
    typeof page === 'string' &&
    typeof pageSize === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: UserGroup[]; count: number };
}
