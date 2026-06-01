import type { WorkspaceAccessLabels, WorkspaceAccessMode } from './types';

export function getWorkspaceAccessLabels(
  mode: WorkspaceAccessMode,
  t: (key: string) => string
): WorkspaceAccessLabels {
  return {
    accessLevelsLabel:
      mode === 'cms'
        ? t('external-projects.settings.access_levels_label')
        : t('ws-roles.plural'),
    assignRolePlaceholder:
      mode === 'cms'
        ? t('external-projects.settings.assign_role_placeholder')
        : t('ws-members.role-placeholder'),
    clearFiltersAction:
      mode === 'cms'
        ? t('external-projects.settings.clear_filters_action')
        : t('ws-members.clear_filters'),
    filterByPermission:
      mode === 'cms'
        ? t('external-projects.settings.filter_by_permission')
        : t('ws-members.filter_by_permission'),
    filterByRole:
      mode === 'cms'
        ? t('external-projects.settings.filter_by_access_level')
        : t('ws-members.filter_by_role'),
    noAdditionalRoles:
      mode === 'cms'
        ? t('external-projects.settings.no_additional_roles')
        : t('ws-members.no_roles_found'),
    noRolesLabel:
      mode === 'cms'
        ? t('external-projects.settings.no_roles_label')
        : t('ws-members.no_roles_found'),
    protectedMemberLabel:
      mode === 'cms'
        ? t('external-projects.settings.protected_member_label')
        : t('ws-members.creator_status'),
    removeMemberAction:
      mode === 'cms'
        ? t('external-projects.settings.remove_access_action')
        : t('ws-members.remove_member'),
    rolesEmptyDescription:
      mode === 'cms'
        ? t('external-projects.settings.roles_empty_description')
        : t('ws-roles.description'),
    rolesEmptyTitle:
      mode === 'cms'
        ? t('external-projects.settings.roles_empty_title')
        : t('ws-roles.no_roles_created'),
  };
}
