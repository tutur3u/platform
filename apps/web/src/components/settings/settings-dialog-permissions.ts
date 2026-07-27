import type {
  WorkspacePermissionsSummary,
  WorkspaceSettingsAvailabilityKey,
} from '@tuturuuu/internal-api/settings';
import type { Workspace } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export type SettingsAvailabilityKey = WorkspaceSettingsAvailabilityKey;

/**
 * One shared wire contract with the satellites, rather than a local copy whose
 * optional fields let a truncated response read as a denial. The fields stay
 * required; `undefined` is only ever the whole summary while it loads.
 */
export type WorkspaceSettingsPermissions = WorkspacePermissionsSummary;

export type SettingsDialogAvailability = {
  allowWorkspaceBasicsEdit: boolean;
  canAccessApiKeys: boolean;
  canAccessInquiries: boolean;
  canAccessIntegrations: boolean;
  canAccessReports: boolean;
  canAccessSecrets: boolean;
  canAccessUsage: boolean;
  canManageWorkspaceMembers: boolean;
  canManageWorkspaceRoles: boolean;
  canManageWorkspaceSettings: boolean;
  hasBillingPermission: boolean;
  isRootWorkspace: boolean;
};

function isSettingsEntryAvailable(
  workspacePermissions: WorkspaceSettingsPermissions | undefined,
  key: SettingsAvailabilityKey,
  fallback = false
) {
  return workspacePermissions?.available?.[key] ?? fallback;
}

export function getSettingsDialogAvailability({
  workspace,
  workspacePermissions,
}: {
  workspace: Workspace | null;
  workspacePermissions?: WorkspaceSettingsPermissions;
}): SettingsDialogAvailability {
  const hasBillingPermission =
    workspacePermissions?.available?.billing ??
    workspacePermissions?.can_access_billing ??
    workspacePermissions?.manage_subscription ??
    false;
  const canManageWorkspaceSettings =
    workspacePermissions?.manage_workspace_settings ?? false;
  const canManageWorkspaceMembers =
    workspacePermissions?.manage_workspace_members ?? false;
  const canManageWorkspaceRoles = isSettingsEntryAvailable(
    workspacePermissions,
    'workspace_roles',
    workspacePermissions?.manage_workspace_roles ?? false
  );
  const canAccessReports = isSettingsEntryAvailable(
    workspacePermissions,
    'reports',
    workspacePermissions?.manage_user_report_templates ?? false
  );
  const canAccessUsage = isSettingsEntryAvailable(
    workspacePermissions,
    'usage',
    workspacePermissions?.view_usage ?? false
  );
  const canAccessIntegrations = isSettingsEntryAvailable(
    workspacePermissions,
    'integrations',
    workspacePermissions?.manage_workspace_integrations ??
      workspacePermissions?.allow_discord_integrations ??
      false
  );
  const canAccessApiKeys = isSettingsEntryAvailable(
    workspacePermissions,
    'api_keys',
    Boolean(
      workspacePermissions?.enable_api_keys &&
        workspacePermissions?.manage_api_keys
    )
  );
  const canAccessSecrets = isSettingsEntryAvailable(
    workspacePermissions,
    'secrets',
    workspacePermissions?.manage_workspace_secrets ?? false
  );
  const isRootWorkspace = workspace?.id === ROOT_WORKSPACE_ID;

  return {
    allowWorkspaceBasicsEdit:
      !isRootWorkspace &&
      (Boolean(workspace?.personal) || canManageWorkspaceSettings),
    canAccessApiKeys,
    canAccessInquiries: isSettingsEntryAvailable(
      workspacePermissions,
      'inquiries'
    ),
    canAccessIntegrations,
    canAccessReports,
    canAccessSecrets,
    canAccessUsage,
    canManageWorkspaceMembers,
    canManageWorkspaceRoles,
    canManageWorkspaceSettings,
    hasBillingPermission,
    isRootWorkspace,
  };
}
