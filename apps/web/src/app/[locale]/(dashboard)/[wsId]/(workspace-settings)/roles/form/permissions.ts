import { PROD_MODE } from '@/constants/common';

type RolePermission = {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
};

type RolePermissionGroup = {
  title: string;
  permissions: RolePermission[];
};

export const permissionGroups = (t: any) => {
  return (
    [
      {
        id: 'workspace',
        title: t('ws-roles.workspace'),
        permissions: [
          {
            id: 'manage_workspace_roles',
            title: t('ws-roles.manage_workspace_roles'),
            description: t('ws-roles.manage_workspace_roles_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_members',
            title: t('ws-roles.manage_workspace_members'),
            description: t('ws-roles.manage_workspace_members_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_invites',
            title: t('ws-roles.manage_workspace_invites'),
            description: t('ws-roles.manage_workspace_invites_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_settings',
            title: t('ws-roles.manage_workspace_settings'),
            description: t('ws-roles.manage_workspace_settings_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_security',
            title: t('ws-roles.manage_workspace_security'),
            description: t('ws-roles.manage_workspace_security_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_audit_logs',
            title: t('ws-roles.manage_workspace_audit_logs'),
            description: t('ws-roles.manage_workspace_audit_logs_description'),
            disableOnProduction: true,
            disabled: true,
          },
          {
            id: 'manage_workspace_billing',
            title: t('ws-roles.manage_workspace_billing'),
            description: t('ws-roles.manage_workspace_billing_description'),
            disableOnProduction: true,
            disabled: true,
          },
        ],
      },
      {
        id: 'ai',
        title: t('ws-roles.ai'),
        permissions: [
          {
            id: 'ai_chat',
            title: t('ws-roles.ai_chat'),
            description: t('ws-roles.ai_chat_description'),
            disableOnProduction: true,
            disabled: true,
          },
        ],
      },
      // {
      //   title: 'AI Lab',
      // },
      // {
      //   title: 'Calendar',
      // },
      // {
      //   title: 'Projects',
      // },
      // {
      //   title: 'Documents',
      // },
      // {
      //   title: 'Drive',
      // },
      // {
      //   title: 'Virtual Users',
      // },
      // {
      //   title: 'Inventory',
      // },
      // {
      //   title: 'Finance',
      // },
    ] as const
  )
    .map((group) => ({
      ...group,
      permissions: (
        group.permissions?.filter((p) => p.title && p.description) || []
      ).map((p) => ({
        ...p,
        disabled: p.disableOnProduction ? PROD_MODE : p.disabled,
      })),
    }))
    .filter(
      (group) =>
        group.title && group.permissions && group.permissions.length > 0
    ) satisfies RolePermissionGroup[];
};
