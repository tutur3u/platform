import { MessageSquarePlus } from '@tuturuuu/icons';
import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { fetchRequireAttentionUserIds } from '@/lib/require-attention-users';
import { listWorkspaceDefaultIncludedGroupIds } from '@/lib/workspace-default-included-groups';
import { AuditLogTable } from './audit-log-table';
import { DuplicateUsersDialog } from './components/duplicate-users-dialog';
import { DatabaseTabs } from './database-tabs';
import UserForm from './form';
import ImportDialogContent from './import-dialog-content';
import { UsersAttentionSupportPanel } from './users-attention-support-panel';
import { WorkspaceUsersTable } from './workspace-users-table';

export const metadata: Metadata = {
  title: 'Database',
  description: 'Manage Database in the Users area of your Tuturuuu workspace.',
};

function parseIntSearchParam(value?: string, fallback = 1) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampPageSize(value?: string, fallback = 10) {
  const parsed = parseIntSearchParam(value, fallback);
  return Math.min(Math.max(parsed, 1), 100);
}

function resolveDatabaseTab(tab?: string): 'users' | 'audit-log' {
  return tab === 'audit-log' ? 'audit-log' : 'users';
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    page?: string;
    pageSize?: string;
    includedGroups?: string | string[];
    excludedGroups?: string | string[];
    status?: string;
    linkStatus?: string;
    groupMembership?: string;
    requireAttention?: string;
    logPeriod?: string;
    logMonth?: string;
    logYear?: string;
    logEventKind?: string;
    logSource?: string;
    logAffectedUser?: string;
    logActor?: string;
    logPage?: string;
    logPageSize?: string;
  }>;
}

export default async function WorkspaceUsersPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId: id } = await params;
  const sp = await searchParams;
  const activeTab = resolveDatabaseTab(sp.tab);

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  const workspacePermissions = await getPermissions({ wsId });
  if (!workspacePermissions) notFound();
  const { containsPermission } = workspacePermissions;

  const hasPrivateInfo = containsPermission('view_users_private_info');
  const hasPublicInfo = containsPermission('view_users_public_info');
  const canCreateUsers = containsPermission('create_users');
  const canUpdateUsers = containsPermission('update_users');
  const canDeleteUsers = containsPermission('delete_users');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canExportUsers = containsPermission('export_users_data');
  const canViewAuditLog = containsPermission('manage_workspace_audit_logs');
  const canViewFeedbacks = containsPermission('view_user_groups');
  const canManageFeedbacks = containsPermission('update_user_groups_scores');
  const canViewUsers = hasPrivateInfo || hasPublicInfo;

  if (!canViewUsers && !canViewAuditLog) {
    notFound();
  }

  if (activeTab === 'users' && !canViewUsers) {
    notFound();
  }

  if (activeTab === 'audit-log' && !canViewAuditLog) {
    notFound();
  }

  const permissions = {
    hasPrivateInfo,
    hasPublicInfo,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canCheckUserAttendance,
  };

  const sbAdmin = await createAdminClient();
  const [
    { data: defaultIncludedGroupIds },
    { data: workspaceConfigs },
    feedbackCountResult,
    attentionUserIds,
  ] = await Promise.all([
    listWorkspaceDefaultIncludedGroupIds(sbAdmin, wsId),
    sbAdmin
      .from('workspace_configs')
      .select('id, value')
      .eq('ws_id', wsId)
      .in('id', [
        DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
        DATABASE_FEATURED_GROUPS_CONFIG_ID,
      ]),
    canViewFeedbacks
      ? sbAdmin
          .from('user_feedbacks')
          .select(
            'id, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)',
            {
              count: 'exact',
              head: true,
            }
          )
          .eq('user.ws_id', wsId)
      : Promise.resolve({ count: 0, error: null }),
    canViewFeedbacks
      ? fetchRequireAttentionUserIds(sbAdmin, {
          wsId,
        })
      : Promise.resolve(new Set<string>()),
  ]);

  const workspaceConfigMap = new Map(
    (workspaceConfigs ?? []).map((config) => [config.id, config.value])
  );
  const initialDefaultExcludedGroups = parseWorkspaceConfigIdList(
    workspaceConfigMap.get(DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID)
  );
  const initialFeaturedGroupIds = parseWorkspaceConfigIdList(
    workspaceConfigMap.get(DATABASE_FEATURED_GROUPS_CONFIG_ID)
  );
  const feedbackCount = feedbackCountResult.count ?? 0;
  const attentionCount = attentionUserIds.size;

  const usersContent =
    activeTab === 'users' ? (
      <WorkspaceUsersTable
        wsId={wsId}
        locale={locale}
        permissions={permissions}
        canViewFeedbacks={canViewFeedbacks}
        canManageFeedbacks={canManageFeedbacks}
        initialDefaultIncludedGroups={defaultIncludedGroupIds}
        initialDefaultExcludedGroups={initialDefaultExcludedGroups}
        initialFeaturedGroupIds={initialFeaturedGroupIds}
        toolbarActions={
          canViewFeedbacks ||
          (canDeleteUsers && canUpdateUsers && hasPrivateInfo) ? (
            <>
              {canViewFeedbacks ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/${wsId}/users/feedbacks`}>
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    {t('ws-users.feedback_center_open')}
                  </Link>
                </Button>
              ) : null}
              {canDeleteUsers && canUpdateUsers && hasPrivateInfo ? (
                <DuplicateUsersDialog wsId={wsId} />
              ) : null}
            </>
          ) : undefined
        }
        toolbarImportContent={
          canExportUsers ? <ImportDialogContent wsId={wsId} /> : undefined
        }
        canExport={canExportUsers}
      />
    ) : undefined;

  const auditLogContent =
    activeTab === 'audit-log' ? (
      <AuditLogTable
        wsId={wsId}
        locale={locale}
        period={sp.logPeriod}
        month={sp.logMonth}
        year={sp.logYear}
        eventKind={sp.logEventKind}
        source={sp.logSource}
        affectedUserQuery={sp.logAffectedUser}
        actorQuery={sp.logActor}
        page={parseIntSearchParam(sp.logPage, 1)}
        pageSize={clampPageSize(sp.logPageSize, 10)}
        canExport={canExportUsers}
        canRepairStatusHistory={canViewAuditLog}
      />
    ) : undefined;

  return (
    <>
      {canViewUsers ? (
        <>
          <FeatureSummary
            pluralTitle={t('ws-users.plural')}
            singularTitle={t('ws-users.singular')}
            description={t('ws-users.description')}
            createTitle={t('ws-users.create')}
            createDescription={t('ws-users.create_description')}
            form={
              canCreateUsers ? (
                <UserForm
                  wsId={wsId}
                  canCreateUsers={canCreateUsers}
                  canUpdateUsers={canUpdateUsers}
                />
              ) : undefined
            }
          />
          <Separator className="my-4" />
          {activeTab === 'users' && canViewFeedbacks ? (
            <UsersAttentionSupportPanel
              wsId={wsId}
              attentionCount={attentionCount}
              feedbackCount={feedbackCount}
            />
          ) : null}
        </>
      ) : null}
      <DatabaseTabs
        activeTab={activeTab}
        canViewUsers={canViewUsers}
        canViewAuditLog={canViewAuditLog}
        usersContent={usersContent}
        auditLogContent={auditLogContent}
      />
    </>
  );
}
