import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { userColumns } from '../../../../../data/columns/users';
import { DataTable } from './data-table';

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
  const { data: users, count } = await getUsers(wsId, searchParams);

  return (
    <DataTable
      data={users}
      columns={userColumns}
      count={count}
      defaultVisibility={{
        id: false,
        gender: false,
        birthday: false,
        ethnicity: false,
        guardian: false,
        address: false,
        national_id: false,
        note: false,
      }}
    />
  );
}

async function getUsers(
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
