import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { getUserColumns } from '../../../../../../data/columns/users';
import useTranslation from 'next-translate/useTranslation';
import { DataTable } from '@/components/ui/custom/tables/data-table';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

export default async function WorkspaceUsersPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { t } = useTranslation('gender');
  const { data, count } = await getData(wsId, searchParams);

  const users = data.map(({ gender, ...rest }) => ({
    ...rest,
    gender: gender ? t(gender) : '',
  }));

  return (
    <DataTable
      data={users}
      namespace="user-data-table"
      columnGenerator={getUserColumns}
      count={count}
      defaultVisibility={{
        id: false,
        ethnicity: false,
        guardian: false,
        address: false,
        national_id: false,
        note: false,
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
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_users')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

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
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
