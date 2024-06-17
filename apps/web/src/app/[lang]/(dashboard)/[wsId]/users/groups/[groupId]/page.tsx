import { UserDatabaseFilter } from '../../filters';
import { CustomDataTable } from '@/components/custom-data-table';
import { getUserColumns } from '@/data/columns/users';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { UserGroup } from '@/types/primitives/UserGroup';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { createClient } from '@/utils/supabase/server';
import { MinusCircledIcon } from '@radix-ui/react-icons';
import useTranslation from 'next-translate/useTranslation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

interface Props {
  params: {
    wsId: string;
    groupId: string;
  };
  searchParams: SearchParams;
}

export default async function UserGroupDetailsPage({
  params: { wsId, groupId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const { t } = useTranslation('user-data-table');

  const group = await getData(wsId, groupId);

  const { data: rawUsers, count: usersCount } = await getUserData(
    wsId,
    groupId,
    searchParams
  );

  const { data: extraFields } = await getUserFields(wsId);

  const { data: excludedUserGroups } = await getExcludedUserGroups(
    wsId,
    groupId
  );

  const users = rawUsers.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

  return (
    <>
      <div className="mb-2 flex flex-col items-center justify-center gap-2 text-lg font-semibold">
        {group.name && <div>{group.name}</div>}
      </div>

      <CustomDataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        count={usersCount}
        filters={[
          <UserDatabaseFilter
            key="excluded-user-groups-filter"
            tag="excludedGroups"
            title={t('excluded_groups')}
            icon={<MinusCircledIcon className="mr-2 h-4 w-4" />}
            options={excludedUserGroups.map((group) => ({
              label: group.name || 'No name',
              value: group.id,
              count: group.amount,
            }))}
          />,
        ]}
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
          group_count: false,
          created_at: false,
          updated_at: false,

          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </>
  );
}

async function getData(wsId: string, groupId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .single();

  if (error) throw error;

  return data as WorkspaceUser;
}

async function getUserData(
  wsId: string,
  groupId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getUserData(wsId, groupId, {
      q,
      pageSize,
      excludedGroups,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}

async function getUserFields(wsId: string) {
  const supabase = createClient();

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

async function getExcludedUserGroups(wsId: string, groupId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: [groupId],
      },
      {
        count: 'exact',
      }
    )
    .select('id, name, amount')
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
