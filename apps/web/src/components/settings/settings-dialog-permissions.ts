import type { Workspace } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export type SettingsAvailabilityKey =
  | 'api_keys'
  | 'billing'
  | 'inquiries'
  | 'integrations'
  | 'reports'
  | 'secrets'
  | 'usage'
  | 'workspace_members'
  | 'workspace_roles'
  | 'workspace_settings';

export type WorkspaceSettingsPermissions = {
  allow_discord_integrations?: boolean;
  available?: Partial<Record<SettingsAvailabilityKey, boolean>>;
  can_access_billing?: boolean;
  enable_api_keys?: boolean;
  is_root_workspace?: boolean;
  manage_api_keys?: boolean;
  manage_subscription: boolean;
  manage_user_report_templates?: boolean;
  manage_workspace_billing?: boolean;
  manage_workspace_integrations?: boolean;
  manage_workspace_members: boolean;
  manage_workspace_roles?: boolean;
  manage_workspace_secrets?: boolean;
  manage_workspace_settings: boolean;
  view_usage?: boolean;
};

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
