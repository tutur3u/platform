import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { getPermissions, verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

async function resolveDiscordIntegrationAccess({
  supabase,
  userId,
}: {
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('platform_user_roles')
    .select('allow_discord_integrations')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    serverLogger.warn('Failed to load Discord integration availability', error);
    return false;
  }

  return Boolean(data?.allow_discord_integrations);
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const [rootPermissions, apiKeysEnabled, discordAllowed] =
        await Promise.all([
          getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
          verifySecret({
            forceAdmin: true,
            name: 'ENABLE_API_KEYS',
            value: 'true',
            wsId: permissions.wsId,
          }).catch(() => false),
          resolveDiscordIntegrationAccess({
            supabase,
            userId: user.id,
          }),
        ]);

      const hasWorkspacePermission = (permission: PermissionId) =>
        permissions.containsPermission(permission);
      const hasRootPermission = (permission: PermissionId) =>
        rootPermissions?.containsPermission(permission) ?? false;
      const isRootWorkspace = permissions.wsId === ROOT_WORKSPACE_ID;
      const isTuturuuuMember = isValidTuturuuuEmail(user.email);
      const canManageApiKeys = hasWorkspacePermission('manage_api_keys');
      const canManageExternalMigrations = hasRootPermission(
        'manage_external_migrations'
      );
      const canManageWorkspaceSecrets = hasRootPermission(
        'manage_workspace_secrets'
      );
      const canManageWorkspaceRoles = hasWorkspacePermission(
        'manage_workspace_roles'
      );
      const canManageRootWorkspaceRoles = hasRootPermission(
        'manage_workspace_roles'
      );
      const canManageUserReportTemplates = hasWorkspacePermission(
        'manage_user_report_templates'
      );
      const canManageWorkspaceIntegrations = hasWorkspacePermission(
        'manage_workspace_integrations'
      );
      const canManageWorkspaceMembers = hasWorkspacePermission(
        'manage_workspace_members'
      );
      const canManageWorkspaceSettings = hasWorkspacePermission(
        'manage_workspace_settings'
      );
      const canManageSubscription = hasWorkspacePermission(
        'manage_subscription'
      );
      const canManageWorkspaceBilling = hasWorkspacePermission(
        'manage_workspace_billing'
      );
      const canViewInfrastructure =
        isRootWorkspace && hasRootPermission('view_infrastructure');
      const canAccessApiKeys = apiKeysEnabled && canManageApiKeys;
      const canAccessBilling =
        canManageSubscription || canManageWorkspaceBilling;
      const canAccessInquiries = isRootWorkspace && isTuturuuuMember;
      const canAccessIntegrations =
        discordAllowed || canManageWorkspaceIntegrations;
      const canAccessMigrations =
        isRootWorkspace && canManageExternalMigrations;
      const canAccessPlatformAdmin =
        isRootWorkspace && canManageRootWorkspaceRoles;
      const canManageExternalApps =
        isRootWorkspace &&
        (canManageWorkspaceSecrets || canManageRootWorkspaceRoles);
      const canManageMobileDeploymentVault = hasRootPermission(
        'manage_mobile_deployment_vault'
      );
      const canManageChangelog = hasRootPermission('manage_changelog');

      return NextResponse.json({
        allow_discord_integrations: discordAllowed,
        can_access_api_keys: canAccessApiKeys,
        can_access_billing: canAccessBilling,
        can_access_infrastructure: canViewInfrastructure,
        can_access_inquiries: canAccessInquiries,
        can_access_integrations: canAccessIntegrations,
        can_access_migrations: canAccessMigrations,
        can_access_platform_billing: canAccessPlatformAdmin,
        can_access_platform_roles: canAccessPlatformAdmin,
        can_access_secrets: canManageWorkspaceSecrets,
        can_manage_external_apps: canManageExternalApps,
        enable_api_keys: apiKeysEnabled,
        is_root_workspace: isRootWorkspace,
        is_tuturuuu_member: isTuturuuuMember,
        manage_api_keys: canManageApiKeys,
        manage_external_migrations: canManageExternalMigrations,
        manage_mobile_deployment_vault: canManageMobileDeploymentVault,
        manage_subscription: canManageSubscription,
        manage_user_report_templates: canManageUserReportTemplates,
        manage_workspace_billing: canManageWorkspaceBilling,
        manage_workspace_integrations: canManageWorkspaceIntegrations,
        manage_workspace_members: canManageWorkspaceMembers,
        manage_workspace_roles: canManageWorkspaceRoles,
        manage_workspace_secrets: canManageWorkspaceSecrets,
        manage_workspace_settings: canManageWorkspaceSettings,
        manage_changelog: canManageChangelog,
        view_infrastructure: canViewInfrastructure,
        view_usage: canManageWorkspaceMembers,
        available: {
          api_keys: canAccessApiKeys,
          billing: canAccessBilling,
          infrastructure: canViewInfrastructure,
          infrastructure_changelog: canViewInfrastructure && canManageChangelog,
          infrastructure_external_apps:
            canViewInfrastructure && canManageExternalApps,
          infrastructure_mobile_deployment:
            canViewInfrastructure && canManageMobileDeploymentVault,
          inquiries: canAccessInquiries,
          integrations: canAccessIntegrations,
          migrations: canAccessMigrations,
          platform_billing: canAccessPlatformAdmin,
          platform_roles: canAccessPlatformAdmin,
          reports: canManageUserReportTemplates,
          secrets: canManageWorkspaceSecrets,
          usage: canManageWorkspaceMembers,
          workspace_members: canManageWorkspaceMembers,
          workspace_roles: canManageWorkspaceRoles,
          workspace_settings: canManageWorkspaceSettings,
        },
      });
    } catch (error) {
      serverLogger.error('Error loading workspace permissions:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 30, swr: 30 } }
);
