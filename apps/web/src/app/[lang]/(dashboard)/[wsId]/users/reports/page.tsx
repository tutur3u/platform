import { UserDatabaseFilter } from '../filters';
import { CustomDataTable } from '@/components/custom-data-table';
import { getUserReportColumns } from '@/data/columns/user-reports';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { WorkspaceUserReport } from '@/types/db';
import { UserGroup } from '@/types/primitives/UserGroup';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/server';
import { PlusCircledIcon } from '@radix-ui/react-icons';
import { User } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

interface SearchParams {
  page?: string;
  pageSize?: string;
  groupId?: string;
  userId?: string;
}

interface Props {
  params: {
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceUserReportsPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const { t } = useTranslation('user-data-table');

  const { data, count } = await getData(wsId, searchParams);
  const { data: userGroups } = await getUserGroups(wsId);
  const { data: users } = searchParams.groupId
    ? await getUsers(wsId, searchParams.groupId)
    : { data: [] };

  const reports =
    data?.map((rp) => ({
      ...rp,
      href: `/${wsId}/users/reports/${rp.id}`,
    })) ?? [];

  return (
    <CustomDataTable
      data={reports}
      columnGenerator={getUserReportColumns}
      namespace="user-report-data-table"
      count={count ?? undefined}
      defaultVisibility={{
        id: false,
        user_id: false,
        created_at: false,
      }}
      filters={[
        <UserDatabaseFilter
          key="group-filter"
          tag="groupId"
          title={t('group')}
          icon={<PlusCircledIcon className="mr-2 h-4 w-4" />}
          defaultValues={searchParams.groupId ? [searchParams.groupId] : []}
          extraQueryOnSet={{ userId: undefined }}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
          multiple={false}
        />,
        <UserDatabaseFilter
          key="user-filter"
          tag="userId"
          title={t('user')}
          icon={<User className="mr-2 h-4 w-4" />}
          defaultValues={
            searchParams.groupId
              ? searchParams.userId &&
                users.map((user) => user.id).includes(searchParams.userId)
                ? [searchParams.userId]
                : []
              : searchParams.userId
                ? [searchParams.userId]
                : []
          }
          options={users.map((user) => ({
            label: user.full_name || 'No name',
            value: user.id,
          }))}
          disabled={!searchParams.groupId}
          resetSignals={['groupId']}
          sortCheckedFirst={false}
          multiple={false}
        />,
      ]}
      disableSearch
    />
  );
}

async function getData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    groupId,
    userId,
    retry = true,
  }: SearchParams & { retry?: boolean }
) {
  const supabase = createClient();

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

  if (groupId) {
    queryBuilder.eq('group_id', groupId);
  }

  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;

  const data = rawData?.map((row) => ({
    // @ts-expect-error
    user_name: row.user.full_name,
    // @ts-expect-error
    creator_name: row.creator.full_name,
    ...row,
  }));

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { pageSize, groupId, userId, retry: false });
  }

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}

async function getUserGroups(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getUsers(wsId: string, groupId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: [],
        search_query: '',
      },
      {
        count: 'exact',
      }
    )
    .select('id, full_name')
    .order('full_name', { ascending: true, nullsFirst: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
