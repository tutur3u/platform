import type { DashboardNavigationLink } from './navigation-icon-descriptor';
import { createDashboardNavigationIcon } from './navigation-icon-descriptor';

export function createWorkspaceMembersNavigationLink({
  canManageMembers,
  isPersonal,
  preferenceSectionLabel,
  t,
}: {
  canManageMembers: boolean;
  isPersonal: boolean;
  preferenceSectionLabel: string;
  t: (key: 'satellite-workspace-settings.manage_members') => string;
}): DashboardNavigationLink | null {
  if (isPersonal || !canManageMembers) return null;

  return {
    icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
    id: 'workspace-members-settings',
    openSettingsDialog: { tab: 'workspace_members' },
    preferenceLocked: true,
    preferencePlacement: 'root',
    preferenceSectionLabel,
    title: t('satellite-workspace-settings.manage_members'),
  };
}
