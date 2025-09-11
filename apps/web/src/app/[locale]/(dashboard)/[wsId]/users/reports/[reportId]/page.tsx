import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types/db';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { PlusCircle, User } from '@tuturuuu/ui/icons';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { availableConfigs } from '@/constants/configs/reports';
import { Filter } from '../../filters';
import EditableReportPreview from './editable-report-preview';

interface Props {
  params: Promise<{
    wsId: string;
    reportId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    groupId?: string;
    userId?: string;
    reportId?: string;
  }>;
}

export default async function WorkspaceUserDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations('user-data-table');
  const { wsId, reportId } = await params;
  const { groupId, userId } = await searchParams;

  const report =
    reportId === 'new'
      ? {
          user_id: userId,
          group_id: groupId,
          group_name: undefined,
          created_at: new Date().toISOString(),
        }
      : await getData({ wsId, reportId });

  const { data: userGroups } = await getUserGroups(wsId);

  const { data: users } =
    groupId || report.group_id
      ? await getUsers(wsId, groupId || report.group_id!)
      : { data: [] };

  const { data: reports } =
    (report.user_id && !groupId && !userId) ||
    (userId && users.map((user) => user.id).includes(userId))
      ? await getReports(
          wsId,
          groupId || report.group_id!,
          userId || report.user_id!,
          reportId !== 'new' && !!userId && report.user_id !== userId
        )
      : { data: [] };

  const { data: configs } = await getConfigs(wsId);

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mb-4 grid flex-wrap items-start gap-2 md:flex">
        <Filter
          key="group-filter"
          tag="groupId"
          title={t('group')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          defaultValues={[groupId || report.group_id!]}
          extraQueryOnSet={{ userId: undefined }}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
          multiple={false}
        />

        <Filter
          key="user-filter"
          tag="userId"
          title={t('user')}
          icon={<User className="mr-2 h-4 w-4" />}
          defaultValues={
            groupId
              ? userId && users.map((user) => user.id).includes(userId)
                ? [userId]
                : []
              : userId
                ? [userId]
                : report.user_id
                  ? [report.user_id]
                  : []
          }
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
          <Filter
            key="report-filter"
            tag="reportId"
            title={t('report')}
            icon={<User className="mr-2 h-4 w-4" />}
            defaultValues={!groupId && !userId ? [reportId] : []}
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

      {(reportId !== 'new' || (!!groupId && !!userId)) && (
        <EditableReportPreview
          wsId={wsId}
          report={{
            ...report,
            group_name:
              report.group_name ||
              userGroups?.find((group) => group.id === report.group_id)?.name ||
              'No group',
          }}
          configs={configs}
          isNew={reportId === 'new'}
        />
      )}
    </div>
  );
}

async function getData({ wsId, reportId }: { wsId: string; reportId: string }) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('external_user_monthly_reports')
    .select(
      '*, user:workspace_users!user_id!inner(full_name, ws_id), creator:workspace_users!creator_id(full_name), ...workspace_user_groups(group_name:name)',
      {
        count: 'exact',
      }
    )
    .eq('id', reportId)
    .eq('user.ws_id', wsId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;
  if (!rawData) notFound();

  const data: {
    user_name?: string;
    creator_name?: string;
    user?: any;
    creator?: any;
    [key: string]: any;
  } = {
    user_name: Array.isArray(rawData.user)
      ? rawData.user?.[0]?.full_name
      : //
        (rawData.user?.full_name ?? undefined),
    creator_name: Array.isArray(rawData.creator)
      ? rawData.creator?.[0]?.full_name
      : //
        (rawData.creator?.full_name ?? undefined),
    ...rawData,
  };

  delete data.user;
  delete data.creator;

  return data as WorkspaceUserReport & { group_name: string };
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

async function getReports(
  wsId: string,
  groupId: string,
  userId: string,
  forceRedirect = false
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
    .eq('user_id', userId)
    .eq('workspace_users.ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData?.map((rawData) => ({
    user_name: rawData.user.full_name,
    creator_name: rawData.creator?.full_name,
    ...rawData,
  }));

  if (forceRedirect) {
    redirect(
      `/${wsId}/users/reports/${data?.[0]?.id || `new?groupId=${groupId}&userId=${userId}`}`
    );
  }

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}

async function getConfigs(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_configs')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  queryBuilder.in(
    'id',
    availableConfigs
      .map(({ id }) => id)
      .filter((id): id is string => id !== undefined)
  );

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  // Create a copy of availableConfigs to include in the response
  const configs = [
    ...availableConfigs.map(({ defaultValue, ...rest }) => ({
      ...rest,
      value: defaultValue,
    })),
  ];

  // If rawData is not empty, merge it with availableConfigs
  if (rawData && rawData.length) {
    rawData.forEach((config) => {
      const index = configs.findIndex((c) => c.id === config.id);
      if (index !== -1) {
        // Replace the default config with the one from the database
        configs[index] = { ...configs[index], ...config };
      } else {
        // If the config does not exist in availableConfigs, add it
        configs.push(config);
      }
    });
  }

  const count = configs.length;

  return { data: configs, count } as {
    data: WorkspaceConfig[];
    count: number;
  };
}
