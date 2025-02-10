import { Filter } from '../../../filters';
import EditableReportPreview from '../../../reports/[reportId]/editable-report-preview';
import { availableConfigs } from '@/constants/configs/reports';
import { cn } from '@/lib/utils';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceUserReport } from '@tutur3u/types/db';
import { UserGroup } from '@tutur3u/types/primitives/UserGroup';
import { WorkspaceConfig } from '@tutur3u/types/primitives/WorkspaceConfig';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import { Button } from '@tutur3u/ui/components/ui/button';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { Calendar, ChartColumn, FileUser, User, UserCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    userId?: string;
    reportId?: string;
  }>;
}

export default async function UserGroupDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();

  const { wsId, groupId } = await params;
  const { reportId, userId } = await searchParams;
  const group = await getData(wsId, groupId);

  const report =
    reportId === 'new'
      ? {
          user_id: userId,
          group_id: groupId,
          group_name: undefined,
          created_at: new Date().toISOString(),
        }
      : reportId
        ? await getReport({ wsId, reportId })
        : undefined;

  const { data: users } = groupId
    ? await getUsers(wsId, groupId)
    : { data: [] };

  const { data: reports } =
    (report?.user_id && !groupId && !userId) ||
    (userId && users.map((user) => user.id).includes(userId))
      ? await getReports(wsId, groupId, userId || report?.user_id!)
      : { data: [] };

  const { data: configs } = await getConfigs(wsId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="w-full text-2xl font-bold">
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="grid flex-wrap gap-2 md:flex">
              <Link href={`/${wsId}/users/groups/${groupId}`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20'
                  )}
                >
                  <Calendar className="h-5 w-5" />
                  {t('infrastructure-tabs.overview')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                  )}
                >
                  <Calendar className="h-5 w-5" />
                  {t('ws-user-group-details.schedule')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/attendance`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                  )}
                >
                  <UserCheck className="h-5 w-5" />
                  {t('ws-user-group-details.attendance')}
                </Button>
              </Link>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold max-sm:w-full',
                  'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                )}
                disabled
              >
                <FileUser className="h-5 w-5" />
                {t('ws-user-group-details.reports')}
              </Button>
              <Link href={`/${wsId}/users/groups/${groupId}/indicators`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                  )}
                >
                  <ChartColumn className="h-5 w-5" />
                  {t('ws-user-group-details.metrics')}
                </Button>
              </Link>
            </div>
          </>
        }
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
      />
      <Separator className="my-4" />
      <div className="flex min-h-full w-full flex-col">
        <div className="mb-4 grid flex-wrap items-start gap-2 md:flex">
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
                  : report?.user_id
                    ? [report.user_id]
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
          />

          {reports.length > 0 && (
            <Filter
              key="report-filter"
              tag="reportId"
              title={t('user-data-table.report')}
              icon={<User className="mr-2 h-4 w-4" />}
              // defaultValues={!groupId && !userId ? [reportId] : []}
              options={reports.map((report) => ({
                label: report.title || 'No title',
                value: report.id,
              }))}
              disabled={!userId && !report?.user_id}
              resetSignals={['groupId', 'userId']}
              sortCheckedFirst={false}
              multiple={false}
            />
          )}
        </div>

        {groupId && userId && (
          <EditableReportPreview
            wsId={wsId}
            report={{
              ...report,
              group_name:
                report?.group_name ||
                group.name ||
                t('ws-user-groups.singular'),
            }}
            configs={configs}
            isNew={false}
          />
        )}
      </div>
    </>
  );
}

async function getData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroup;
}

async function getReport({
  wsId,
  reportId,
}: {
  wsId: string;
  reportId: string;
}) {
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
      : (rawData.user?.full_name ?? undefined),
    creator_name: Array.isArray(rawData.creator)
      ? rawData.creator?.[0]?.full_name
      : (rawData.creator?.full_name ?? undefined),
    ...rawData,
  };

  delete data.user;
  delete data.creator;

  return data as WorkspaceUserReport & { group_name: string };
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

async function getReports(wsId: string, groupId: string, userId: string) {
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
    .eq('group_id', groupId)
    .eq('workspace_users.ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData?.map((rawData) => ({
    user_name: rawData.user.full_name,
    creator_name: rawData.creator?.full_name,
    ...rawData,
  }));

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
  let configs = [
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
