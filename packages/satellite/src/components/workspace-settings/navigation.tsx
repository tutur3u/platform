import { Building, CreditCard, Users } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { createElement } from 'react';

export type WorkspaceSettingsTranslator = (key: string) => string;

export function createWorkspaceSettingsNavGroup(
  t: WorkspaceSettingsTranslator
): SettingsNavGroup {
  return {
    label: t('satellite-workspace-settings.title'),
    items: [
      {
        description: t('satellite-workspace-settings.general_description'),
        icon: Building,
        keywords: ['Workspace', 'General', 'Identity', 'Avatar'],
        label: t('satellite-workspace-settings.general'),
        name: 'workspace_general',
      },
      {
        description: t('satellite-workspace-settings.members_description'),
        icon: Users,
        keywords: ['Members', 'People', 'Roles', 'Invites', 'Links'],
        label: t('satellite-workspace-settings.members'),
        name: 'workspace_members',
      },
      {
        description: t('satellite-workspace-settings.billing_description'),
        icon: CreditCard,
        keywords: ['Billing', 'Plan', 'Subscription', 'Seats'],
        label: t('satellite-workspace-settings.billing'),
        name: 'workspace_billing',
      },
    ],
  };
}

export function createWorkspaceMembersNavLink(
  t: WorkspaceSettingsTranslator
): NavLink {
  return {
    icon: createElement(Users, { className: 'h-4 w-4' }),
    id: 'workspace-members-settings',
    openSettingsDialog: { tab: 'workspace_members' },
    title: t('satellite-workspace-settings.manage_members'),
  };
}
