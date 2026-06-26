import { describe, expect, it } from 'vitest';
import { buildSettingsNavItems } from './settings-dialog-nav-items';
import type { SettingsTranslator } from './settings-dialog-nav-types';
import type { SettingsDialogAvailability } from './settings-dialog-permissions';

const t = Object.assign((key: string) => key, {
  has: () => true,
  markup: (key: string) => key,
  raw: (key: string) => key,
  rich: (key: string) => key,
}) as unknown as SettingsTranslator;

const baseAvailability: SettingsDialogAvailability = {
  allowWorkspaceBasicsEdit: false,
  canAccessApiKeys: false,
  canAccessInfrastructure: false,
  canAccessInfrastructureChangelog: false,
  canAccessInfrastructureExternalApps: false,
  canAccessInfrastructureMobileDeployment: false,
  canAccessInternalProjects: false,
  canAccessInquiries: false,
  canAccessIntegrations: false,
  canAccessMigrations: false,
  canAccessPlatformBilling: false,
  canAccessPlatformRoles: false,
  canAccessReports: false,
  canAccessSecrets: false,
  canAccessUsage: false,
  canManageWorkspaceMembers: false,
  canManageWorkspaceSettings: false,
  hasBillingPermission: false,
  isRootWorkspace: false,
};

function namesFor(availability: SettingsDialogAvailability, wsId?: string) {
  return buildSettingsNavItems({
    availability,
    isBillingPermissionLoading: false,
    t,
    wsId,
  })
    .flatMap((group) => group.items)
    .map((item) => item.name);
}

describe('settings dialog nav items', () => {
  it('omits workspace-scoped settings when no workspace is active', () => {
    const names = namesFor(baseAvailability, undefined);

    expect(names).toContain('profile');
    expect(names).toContain('navigation');
    expect(names).not.toContain('workspace_general');
    expect(names).not.toContain('calendar_general');
    expect(names).not.toContain('integrations');
  });

  it('hides restricted workspace entries without matching availability', () => {
    const names = namesFor(baseAvailability, 'ws_1');

    expect(names).toContain('workspace_general');
    expect(names).toContain('user_status');
    expect(names).not.toContain('workspace_members');
    expect(names).not.toContain('workspace_billing');
    expect(names).not.toContain('usage');
    expect(names).not.toContain('integrations');
    expect(names).not.toContain('api_keys');
    expect(names).not.toContain('secrets');
    expect(names).not.toContain('migrations');
    expect(names).not.toContain('platform_roles');
    expect(names).not.toContain('internal_projects');
    expect(names).not.toContain('infrastructure_overview');
  });

  it('shows internal project management without broad infrastructure access', () => {
    const names = namesFor(
      {
        ...baseAvailability,
        canAccessInternalProjects: true,
      },
      'ws_1'
    );

    expect(names).toContain('internal_projects');
    expect(names).not.toContain('infrastructure_overview');
  });

  it('includes permission-gated settings entries when availability allows them', () => {
    const names = namesFor(
      {
        ...baseAvailability,
        canAccessApiKeys: true,
        canAccessInfrastructure: true,
        canAccessInfrastructureChangelog: true,
        canAccessInfrastructureExternalApps: true,
        canAccessInfrastructureMobileDeployment: true,
        canAccessInternalProjects: true,
        canAccessInquiries: true,
        canAccessIntegrations: true,
        canAccessMigrations: true,
        canAccessPlatformBilling: true,
        canAccessPlatformRoles: true,
        canAccessReports: true,
        canAccessSecrets: true,
        canAccessUsage: true,
        canManageWorkspaceMembers: true,
        hasBillingPermission: true,
      },
      'ws_1'
    );

    expect(names).toContain('workspace_members');
    expect(names).toContain('workspace_billing');
    expect(names).toContain('workspace_reports');
    expect(names).toContain('usage');
    expect(names).toContain('integrations');
    expect(names).toContain('api_keys');
    expect(names).toContain('secrets');
    expect(names).toContain('migrations');
    expect(names).toContain('platform_roles');
    expect(names).toContain('platform_billing');
    expect(names).toContain('inquiries');
    expect(names).toContain('infrastructure_overview');
    expect(names).toContain('internal_projects');
    expect(names).toContain('infrastructure_external_apps');
    expect(names).toContain('infrastructure_mobile_deployment');
    expect(names).toContain('infrastructure_changelog');
  });
});
