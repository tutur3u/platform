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
  canAccessInquiries: false,
  canAccessIntegrations: false,
  canAccessReports: false,
  canAccessSecrets: false,
  canAccessUsage: false,
  canManageWorkspaceMembers: false,
  canManageWorkspaceRoles: false,
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
    expect(names).not.toContain('platform_billing');
    expect(names).not.toContain('infrastructure_overview');
  });

  it('includes permission-gated settings entries when availability allows them', () => {
    const names = namesFor(
      {
        ...baseAvailability,
        canAccessApiKeys: true,
        canAccessInquiries: true,
        canAccessIntegrations: true,
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
    expect(names).not.toContain('workspace_reports');
    expect(names).not.toContain('tasks_general');
    expect(names).not.toContain('calendar_general');
    expect(names).not.toContain('finance_navigation');
    expect(names).toContain('usage');
    expect(names).toContain('integrations');
    expect(names).toContain('api_keys');
    expect(names).toContain('secrets');
    expect(names).not.toContain('migrations');
    expect(names).toContain('inquiries');
    expect(names).not.toContain('platform_roles');
    expect(names).not.toContain('platform_billing');
    expect(names).not.toContain('internal_projects');
    expect(names).not.toContain('infrastructure_overview');
    expect(names).not.toContain('infrastructure_external_apps');
    expect(names).not.toContain('infrastructure_mobile_deployment');
    expect(names).not.toContain('infrastructure_changelog');
  });
});
