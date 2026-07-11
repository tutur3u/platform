import { PlusCircle, User } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Filter } from '@tuturuuu/ui/custom/user-filters';
import {
  getWorkspaceUserArchiveState,
  sortWorkspaceUsersByArchive,
} from '@tuturuuu/users-core/reports/user-archive';
import { availableConfigs } from '@tuturuuu/utils/configs/reports';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import EditableReportPreview from './editable-report-preview';

type ReportWorkspaceViewRow = WorkspaceUserReport & {
  creator_full_name?: string | null;
  group_name?: string | null;
  user_archived?: boolean | null;
  user_archived_until?: string | null;
  user_full_name?: string | null;
  user_note?: string | null;
};

export const metadata: Metadata = {
  title: 'Report Details',
  description:
    'Manage Report Details in the Reports area of your Tuturuuu workspace.',
};

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
  await connection();

  const t = await getTranslations('user-data-table');
  const tAll = await getTranslations();
  const locale = await getLocale();
  const { wsId, reportId } = await params;
  const { groupId, userId } = await searchParams;
  const permissions = await getPermissions({ wsId });

  if (!permissions?.containsPermission('view_user_groups_reports')) {
    notFound();
  }

  const canCheckUserAttendance = permissions.containsPermission(
    'check_user_attendance'
  );
  const canApproveReports = permissions.containsPermission('approve_reports');
  const canCreateReports = permissions.containsPermission(
    'create_user_groups_reports'
  );
  const canUpdateReports = permissions.containsPermission(
    'update_user_groups_reports'
  );
  const canDeleteReports = permissions.containsPermission(
    'delete_user_groups_reports'
  );

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

  const userFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  });

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
          options={users.map((user) => {
            const archiveState = getWorkspaceUserArchiveState(user);
            const badgeLabel =
              archiveState === 'active'
                ? tAll('ws-users.status_active')
                : archiveState === 'temporary-archived'
                  ? tAll('ws-users.status_archived_until')
                  : tAll('ws-users.status_archived');

            return {
              label: user.full_name || 'No name',
              value: user.id,
              badge: badgeLabel,
              badgeClassName:
                archiveState === 'active'
                  ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                  : archiveState === 'temporary-archived'
                    ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                    : archiveState === 'archived'
                      ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                      : undefined,
              description:
                archiveState === 'temporary-archived' && user.archived_until
                  ? userFormatter.format(new Date(user.archived_until))
                  : undefined,
              indicatorClassName:
                archiveState === 'temporary-archived'
                  ? 'bg-dynamic-yellow'
                  : archiveState === 'archived'
                    ? 'bg-dynamic-red'
                    : 'bg-green-500',
            };
          })}
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
          key={reportId === 'new' ? `new-${userId}-${groupId}` : reportId}
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
          canCheckUserAttendance={canCheckUserAttendance}
          canApproveReports={canApproveReports}
          canCreateReports={canCreateReports}
          canUpdateReports={canUpdateReports}
          canDeleteReports={canDeleteReports}
        />
      )}
    </div>
  );
}

async function getData({ wsId, reportId }: { wsId: string; reportId: string }) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const queryBuilder = privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select('*', { count: 'exact' })
    .eq('id', reportId)
    .eq('user_ws_id', wsId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;
  if (!rawData) notFound();

  const report = rawData as unknown as ReportWorkspaceViewRow;

  const data: WorkspaceUserReport & {
    group_name: string;
    user_archived?: boolean;
    user_archived_until?: string | null;
    user_note?: string | null;
    user_name?: string;
    creator_name?: string;
  } = {
    ...report,
    user_name: report.user_full_name ?? undefined,
    user_archived: report.user_archived ?? undefined,
    user_archived_until: report.user_archived_until ?? undefined,
    user_note: report.user_note ?? undefined,
    creator_name: report.creator_full_name ?? undefined,
    group_name: report.group_name || 'No group',
  };

  return data;
}

async function getUserGroups(wsId: string) {
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
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
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: [],
        search_query: '',
        include_archived: true,
      },
      {
        count: 'exact',
      }
    )
    .select('id, full_name, archived, archived_until')
    .order('full_name', { ascending: true, nullsFirst: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return {
    data: sortWorkspaceUsersByArchive((data ?? []) as WorkspaceUser[]),
    count,
  } as { data: WorkspaceUser[]; count: number };
}

async function getReports(
  wsId: string,
  groupId: string,
  userId: string,
  forceRedirect = false
) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const queryBuilder = privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('user_ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const rows = (rawData || []) as unknown as ReportWorkspaceViewRow[];

  const data = rows.map((row) => ({
    ...row,
    user_name: row.user_full_name ?? undefined,
    creator_name: row.creator_full_name ?? undefined,
  }));

  if (forceRedirect) {
    redirect(
      `/${wsId}/users/reports/${data?.[0]?.id || `new?groupId=${groupId}&userId=${userId}`}`
    );
  }

  return { data, count } as { data: WorkspaceUserReport[]; count: number };
}

async function getConfigs(wsId: string) {
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
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
  const configs: WorkspaceConfig[] = [
    ...availableConfigs.map(
      ({ defaultValue, ...rest }) =>
        ({
          ...rest,
          value: defaultValue,
        }) as unknown as WorkspaceConfig
    ),
  ];

  // If rawData is not empty, merge it with availableConfigs
  if (rawData?.length) {
    for (const config of rawData) {
      const index = configs.findIndex((c) => c.id === config.id);
      if (index !== -1) {
        // Replace the default config with the one from the database
        configs[index] = {
          ...configs[index],
          ...config,
          value: config.value || '',
        };
      } else {
        // If the config does not exist in availableConfigs, add it
        configs.push({
          id: config.id,
          ws_id: config.ws_id,
          // @ts-expect-error - type is not in rawData but required in WorkspaceConfig
          type: config.type,
          // @ts-expect-error - name is not in rawData but required in WorkspaceConfig
          name: config.name,
          updated_at: config.updated_at,
          created_at: config.created_at,
          value: config.value || '',
        } as unknown as WorkspaceConfig);
      }
    }
  }

  const count = configs.length;

  return { data: configs, count } as {
    data: WorkspaceConfig[];
    count: number;
  };
}
