import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getUserColumns } from '@/data/columns/users';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { verifyHasSecrets } from '@/lib/workspace-helper';

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
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);

  const { data, count } = await getData(wsId, searchParams);
  const { data: extraFields } = await getUserFields(wsId);

  const users = data.map((u) => ({ ...u, href: `/${wsId}/users/database/${u.id}` }));

  return (
    <>
      {/* <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{t('users')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <SecretEditDialog
            data={{
              ws_id: wsId,
            }}
            trigger={
              <Button>
                <Plus className="mr-2 h-5 w-5" />
                {t('create_user')}
              </Button>
            }
            submitLabel={t('create_secret')}
          />
        </div>
      </div>
      <Separator className="my-4" /> */}

      <DataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        count={count}
        defaultVisibility={{
          id: false,
          gender: false,
          avatar_url: false,
          display_name: false,
          ethnicity: false,
          guardian: false,
          address: false,
          national_id: false,
          note: false,
          linked_users: false,
          created_at: false,
          updated_at: false,

          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </>
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

async function getUserFields(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUserField[]; count: number };
}
