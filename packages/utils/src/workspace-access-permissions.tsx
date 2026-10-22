import { KeyRound, Settings2, UserCheck, UserCog } from '@tuturuuu/icons';
import type { RolePermission } from './permissions';

export function workspaceAccessPermissions(
  t: (key: string) => string
): RolePermission[] {
  return [
    {
      id: 'manage_workspace_roles',
      icon: <UserCog />,
      title: t('ws-roles.manage_workspace_roles'),
      description: t('ws-roles.manage_workspace_roles_description'),
      disableOnProduction: false,
      disabled: false,
    },
    {
      id: 'manage_workspace_members',
      icon: <UserCheck />,
      title: t('ws-roles.manage_workspace_members'),
      description: t('ws-roles.manage_workspace_members_description'),
      disableOnProduction: false,
      disabled: false,
    },
    {
      id: 'manage_workspace_settings',
      icon: <Settings2 />,
      title: t('ws-roles.manage_workspace_settings'),
      description: t('ws-roles.manage_workspace_settings_description'),
      disableOnProduction: false,
      disabled: false,
    },
    {
      id: 'manage_sso_clients',
      icon: <KeyRound />,
      title: t('ws-roles.manage_sso_clients'),
      description: t('ws-roles.manage_sso_clients_description'),
      disableOnProduction: false,
      disabled: false,
    },
  ];
}
