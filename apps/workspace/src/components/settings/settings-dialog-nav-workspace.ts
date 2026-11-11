import { Building, CreditCard, LayoutGrid, Users } from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildWorkspaceSettingsNavGroups({
  availability,
  isBillingPermissionLoading,
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  if (!wsId) return [];

  return [
    {
      label: t('settings.workspaces.title'),
      items: [
        {
          name: 'workspace_general',
          label: t('settings.workspaces.general'),
          icon: Building,
          description: t('ws-settings.general-description'),
          keywords: ['Workspace', 'General'],
        },
        ...(availability.canManageWorkspaceMembers
          ? [
              {
                name: 'workspace_members',
                label: t('settings.workspaces.members'),
                icon: Users,
                description: t('ws-settings.members-description'),
                keywords: ['Members', 'Team', 'Roles'],
              },
            ]
          : []),
        ...(availability.hasBillingPermission
          ? [
              {
                name: 'workspace_billing',
                label: t('billing.billing'),
                icon: CreditCard,
                description: t('settings-account.billing-description'),
                keywords: ['Billing', 'Plan', 'Subscription'],
                disabled: isBillingPermissionLoading,
              },
            ]
          : []),
        ...(availability.canAccessUsage
          ? [
              {
                name: 'usage',
                label: t('sidebar_tabs.usage'),
                icon: LayoutGrid,
                keywords: ['Usage', 'Activity', 'Metrics', 'Quota'],
              },
            ]
          : []),
        {
          name: 'user_status',
          label: t('settings.workspaces.user_status'),
          icon: Users,
          description: t('settings.workspaces.user_status_description'),
          keywords: ['User Status'],
        },
      ],
    },
  ];
}
