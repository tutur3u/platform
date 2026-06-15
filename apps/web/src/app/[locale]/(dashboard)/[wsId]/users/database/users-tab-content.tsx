import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { listWorkspaceDefaultIncludedGroupIds } from '@/lib/workspace-default-included-groups';
import ImportDialogContent from './import-dialog-content';
import { WorkspaceUsersTable } from './workspace-users-table';

interface UsersTabContentProps {
  wsId: string;
  locale: string;
  permissions: {
    hasPrivateInfo: boolean;
    hasPublicInfo: boolean;
    canCreateUsers: boolean;
    canUpdateUsers: boolean;
    canDeleteUsers: boolean;
    canCheckUserAttendance: boolean;
    canManageUserProfileLinks: boolean;
  };
  canViewFeedbacks: boolean;
  canManageFeedbacks: boolean;
  canExportUsers: boolean;
}

/**
 * Async server component that loads the table's seed data (default included /
 * excluded / featured groups) and renders the workspace users table. Lives
 * behind a Suspense boundary and is only mounted on the users tab, so the
 * audit-log / profile-links tabs never trigger these queries.
 */
export async function UsersTabContent({
  wsId,
  locale,
  permissions,
  canViewFeedbacks,
  canManageFeedbacks,
  canExportUsers,
}: UsersTabContentProps) {
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

  return (
    <WorkspaceUsersTable
      wsId={wsId}
      locale={locale}
      permissions={permissions}
      canViewFeedbacks={canViewFeedbacks}
      canManageFeedbacks={canManageFeedbacks}
      initialDefaultIncludedGroups={defaultIncludedGroupIds}
      initialDefaultExcludedGroups={initialDefaultExcludedGroups}
      initialFeaturedGroupIds={initialFeaturedGroupIds}
      toolbarImportContent={
        canExportUsers ? <ImportDialogContent wsId={wsId} /> : undefined
      }
      canExport={canExportUsers}
    />
  );
}
