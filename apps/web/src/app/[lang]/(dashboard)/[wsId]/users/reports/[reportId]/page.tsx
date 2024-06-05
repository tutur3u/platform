import { Separator } from '@/components/ui/separator';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';
import { UserDatabaseFilter } from '../../filters';
import { PlusCircledIcon } from '@radix-ui/react-icons';
import { UserGroup } from '@/types/primitives/UserGroup';
import { User } from 'lucide-react';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { WorkspaceUserReport } from '@/types/db';
import { redirect } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
    reportId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
    groupId?: string;
    userId?: string;
    reportId?: string;
  };
}

export default async function WorkspaceUserDetailsPage({
  params: { wsId, reportId },
  searchParams: { groupId, userId },
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);

  const { t } = useTranslation('user-data-table');

  const report =
    reportId === 'new'
      ? { created_at: new Date() }
      : await getData({ wsId, reportId });

  const { data: userGroups } = await getUserGroups(wsId);

  const { data: users } =
    groupId || report.group_id
      ? await getUsers(wsId, groupId || report.group_id)
      : { data: [] };

  const { data: reports } =
    userId || report.user_id
      ? await getReports(
          wsId,
          groupId || report.group_id,
          userId || report.user_id,
          reportId !== 'new' && !!userId && report.user_id !== userId
        )
      : { data: [] };

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <UserDatabaseFilter
          key="group-filter"
          tag="groupId"
          title={t('group')}
          icon={<PlusCircledIcon className="mr-2 h-4 w-4" />}
          defaultValues={[report.group_id || groupId]}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
          multiple={false}
        />

        <UserDatabaseFilter
          key="user-filter"
          tag="userId"
          title={t('user')}
          icon={<User className="mr-2 h-4 w-4" />}
          defaultValues={[report.user_id || userId]}
          options={users.map((user) => ({
            label: user.full_name || 'No name',
            value: user.id,
          }))}
          disabled={!groupId && !report.group_id}
          resetSignals={['groupId']}
          sortCheckedFirst={false}
          multiple={false}
        />

        {reports.length > 0 && (
          <UserDatabaseFilter
            key="report-filter"
            tag="reportId"
            title={t('report')}
            icon={<User className="mr-2 h-4 w-4" />}
            defaultValues={[reportId]}
            options={reports.map((report) => ({
              label: report.title || 'No title',
              value: report.id,
            }))}
            href={`/${wsId}/users/reports`}
            disabled={!userId && !report.user_id}
            resetSignals={['groupId', 'userId']}
            sortCheckedFirst={false}
            multiple={false}
          />
        )}
      </div>

      <div className="grid h-fit gap-4 2xl:grid-cols-2">
        <div className="grid h-fit gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">Thông tin cơ bản</div>
          <Separator />

          <div className="flex gap-1">
            <span className="opacity-60">{t('created_at')}:</span>{' '}
            {report.created_at
              ? moment(report.created_at).format('DD/MM/YYYY, HH:mm:ss')
              : '-'}
          </div>
        </div>

        {/* <div className="grid h-fit gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">JSON Data</div>
          <Separator />

          <pre className="overflow-auto">{JSON.stringify(report, null, 2)}</pre>

          <div className="flex gap-1">
            <span className="opacity-60">{t('created_at')}:</span>{' '}
            {report.created_at
              ? moment(report.created_at).format('DD/MM/YYYY, HH:mm:ss')
              : '-'}
          </div>
        </div> */}
      </div>
    </div>
  );
}

async function getData({ wsId, reportId }: { wsId: string; reportId: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('external_user_monthly_reports')
    .select(
      '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name)',
      {
        count: 'exact',
      }
    )
    .eq('id', reportId)
    .eq('user.ws_id', wsId)
    .order('created_at', { ascending: false })
    .single();

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  const data: {
    user_name?: string;
    creator_name?: string;
    user?: any;
    creator?: any;
    [key: string]: any;
  } = {
    user_name: Array.isArray(rawData.user)
      ? rawData.user?.[0]?.full_name
      : // @ts-expect-error
        rawData.user?.full_name ?? undefined,
    creator_name: Array.isArray(rawData.creator)
      ? rawData.creator?.[0]?.full_name
      : // @ts-expect-error
        rawData.creator?.full_name ?? undefined,
    ...rawData,
  };

  delete data.user;
  delete data.creator;

  return data;
}

async function getUserGroups(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

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
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: [],
        search_query: null,
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

async function getReports(
  wsId: string,
  groupId: string,
  userId: string,
  forceRedirect = false
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
    .eq('user_id', userId)
    .eq('workspace_users.ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData?.map((rawData) => ({
    user_name: rawData.user.full_name,
    creator_name: rawData.creator.full_name,
    ...rawData,
  }));

  if (forceRedirect) {
    redirect(
      `/${wsId}/users/reports/${data?.[0]?.id || `new?groupId=${groupId}&userId=${userId}`}`
    );
  }

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}
