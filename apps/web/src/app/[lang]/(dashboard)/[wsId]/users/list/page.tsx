import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getUserColumns } from '@/data/columns/users';
import { DataTable } from '@/components/ui/custom/tables/data-table';

export const dynamic = 'force-dynamic';

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
  const { data, count } = await getData(wsId, searchParams);
  const users = data.map((u) => ({ ...u, href: `/${wsId}/users/${u.id}` }));

  return (
    <DataTable
      data={users}
      namespace="user-data-table"
      columnGenerator={getUserColumns}
      count={count}
      defaultVisibility={{
        id: false,
        avatar_url: false,
        ethnicity: false,
        guardian: false,
        address: false,
        national_id: false,
        note: false,
        linked_users: false,
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
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .from('workspace_users')
    .select(
      '*, linked_users:workspace_user_linked_users(platform_user_id, users(display_name, workspace_members!inner(user_id, ws_id)))',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .eq('linked_users.users.workspace_members.ws_id', wsId)
    .order('full_name', { ascending: true, nullsFirst: false });

  if (q) queryBuilder.ilike('full_name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  const data = rawData.map(({ linked_users, ...rest }) => ({
    ...rest,
    linked_users: linked_users
      .map(
        ({
          platform_user_id,
          users,
        }: {
          platform_user_id: string;
          users: {
            display_name: string;
          } | null;
        }) =>
          users
            ? { id: platform_user_id, display_name: users.display_name }
            : null
      )
      .filter((v: WorkspaceUser | null) => v),
  }));

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
