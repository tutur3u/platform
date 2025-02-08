import { Filter } from '../filters';
import { getUserReportColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@repo/supabase/next/server';
import { WorkspaceUserReport } from '@repo/types/db';
import { UserGroup } from '@repo/types/primitives/UserGroup';
import { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { Plus, PlusCircle, User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface SearchParams {
  page?: string;
  pageSize?: string;
  groupId?: string;
  userId?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceUserReportsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  const { page, pageSize, groupId, userId } = await searchParams;

  const { data, count } = await getData(wsId, {
    page,
    pageSize,
    groupId,
    userId,
  });
  const { data: userGroups } = await getUserGroups(wsId);
  const { data: users } = groupId
    ? await getUsers(wsId, groupId)
    : { data: [] };

  const reports =
    data?.map((rp) => ({
      ...rp,
      href: `/${wsId}/users/reports/${rp.id}`,
    })) ?? [];

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-user-reports.plural')}
        singularTitle={t('ws-user-reports.singular')}
        description={t('ws-user-reports.description')}
        action={
          <Link href={`/${wsId}/users/reports/new`}>
            <Button className="w-full md:w-fit">
              <Plus className="mr-2 h-5 w-5" />
              {t('ws-user-reports.create')}
            </Button>
          </Link>
        }
      />
      <Separator className="my-4" />
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
          <Filter
            key="group-filter"
            tag="groupId"
            title={t('user-data-table.group')}
            icon={<PlusCircle className="mr-2 h-4 w-4" />}
            defaultValues={groupId ? [groupId] : []}
            extraQueryOnSet={{ userId: undefined }}
            options={userGroups.map((group) => ({
              label: group.name || 'No name',
              value: group.id,
              count: group.amount,
            }))}
            multiple={false}
          />,
          <Filter
            key="user-filter"
            tag="userId"
            title={t('user-data-table.user')}
            icon={<User className="mr-2 h-4 w-4" />}
            defaultValues={
              groupId
                ? userId && users.map((user) => user.id).includes(userId)
                  ? [userId]
                  : []
                : userId
                  ? [userId]
                  : []
            }
            options={users.map((user) => ({
              label: user.full_name || 'No name',
              value: user.id,
            }))}
            disabled={!groupId}
            resetSignals={['groupId']}
            sortCheckedFirst={false}
            multiple={false}
          />,
        ]}
        disableSearch
      />
    </>
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
  const supabase = await createClient();

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
    user_name: row.user.full_name,
    creator_name: row.creator?.full_name,
    ...row,
  }));

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { pageSize, groupId, userId, retry: false });
  }

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}

async function getUserGroups(wsId: string) {
  const supabase = await createClient();

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
  const supabase = await createClient();

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
