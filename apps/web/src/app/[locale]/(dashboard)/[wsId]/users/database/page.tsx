import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listWorkspaceDefaultIncludedGroupIds } from '@/lib/workspace-default-included-groups';
import { AuditLogTable } from './audit-log-table';
import { DuplicateUsersDialog } from './components/duplicate-users-dialog';
import { DatabaseTabs } from './database-tabs';
import UserForm from './form';
import ImportDialogContent from './import-dialog-content';
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
    logStatus?: string;
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

  // User must have at least one permission to view users
  if (!hasPrivateInfo && !hasPublicInfo) {
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
  const [{ data: defaultIncludedGroupIds }, { data: workspaceConfigs }] =
    await Promise.all([
      listWorkspaceDefaultIncludedGroupIds(sbAdmin, wsId),
      sbAdmin
        .from('workspace_configs')
        .select('id, value')
        .eq('ws_id', wsId)
        .in('id', [
          DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
          DATABASE_FEATURED_GROUPS_CONFIG_ID,
        ]),
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

  const usersContent =
    activeTab === 'users' ? (
      <WorkspaceUsersTable
        wsId={wsId}
        locale={locale}
        permissions={permissions}
        initialDefaultIncludedGroups={defaultIncludedGroupIds}
        initialDefaultExcludedGroups={initialDefaultExcludedGroups}
        initialFeaturedGroupIds={initialFeaturedGroupIds}
        toolbarActions={
          canDeleteUsers && canUpdateUsers && hasPrivateInfo ? (
            <DuplicateUsersDialog wsId={wsId} />
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
        status={sp.logStatus}
        page={parseIntSearchParam(sp.logPage, 1)}
        pageSize={clampPageSize(sp.logPageSize, 10)}
        canExport={canExportUsers}
      />
    ) : undefined;

  return (
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
      <DatabaseTabs
        activeTab={activeTab}
        usersContent={usersContent}
        auditLogContent={auditLogContent}
      />
    </>
  );
}
