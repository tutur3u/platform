import { PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { PermissionId } from '@/types/db';

export type RolePermission = {
  id: PermissionId;
  title: string;
  description: string;
  disabled?: boolean;
};

export type RolePermissionGroup = {
  id: string;
  title: string;
  permissions: RolePermission[];
};

export const permissionGroups = ({
  t = (key: string) => key,
  wsId,
}: {
  t?: any;
  wsId: string;
}) => {
  return (
    [
      ...(wsId === ROOT_WORKSPACE_ID
        ? [
            {
              id: 'infrastructure',
              title: t('ws-roles.infrastructure'),
              permissions: [
                {
                  id: 'view_infrastructure',
                  title: t('ws-roles.view_infrastructure'),
                  description: t('ws-roles.view_infrastructure_description'),
                  disableOnProduction: false,
                  disabled: false,
                },
                {
                  id: 'manage_workspace_secrets',
                  title: t('ws-roles.manage_workspace_secrets'),
                  description: t(
                    'ws-roles.manage_workspace_secrets_description'
                  ),
                  disableOnProduction: false,
                  disabled: false,
                },
                {
                  id: 'manage_external_migrations',
                  title: t('ws-roles.manage_external_migrations'),
                  description: t(
                    'ws-roles.manage_external_migrations_description'
                  ),
                  disableOnProduction: false,
                  disabled: false,
                },
                {
                  id: 'manage_workspace_audit_logs',
                  title: t('ws-roles.manage_workspace_audit_logs'),
                  description: t(
                    'ws-roles.manage_workspace_audit_logs_description'
                  ),
                  disableOnProduction: true,
                  disabled: true,
                },
              ],
            },
          ]
        : []),
      {
        id: 'workspace',
        title: t('ws-roles.workspace'),
        permissions: [
          {
            id: 'manage_workspace_roles',
            title: t('ws-roles.manage_workspace_roles'),
            description: t('ws-roles.manage_workspace_roles_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_workspace_members',
            title: t('ws-roles.manage_workspace_members'),
            description: t('ws-roles.manage_workspace_members_description'),
            disableOnProduction: false,
            disabled: false,
          },
          // {
          //   id: 'manage_workspace_settings',
          //   title: t('ws-roles.manage_workspace_settings'),
          //   description: t('ws-roles.manage_workspace_settings_description'),
          //   disableOnProduction: true,
          //   disabled: true,
          // },
          {
            id: 'manage_workspace_security',
            title: t('ws-roles.manage_workspace_security'),
            description: t('ws-roles.manage_workspace_security_description'),
            disableOnProduction: false,
            disabled: false,
          },
          // {
          //   id: 'manage_workspace_billing',
          //   title: t('ws-roles.manage_workspace_billing'),
          //   description: t('ws-roles.manage_workspace_billing_description'),
          //   disableOnProduction: true,
          //   disabled: true,
          // },
        ],
      },
      // {
      //   id: 'ai',
      //   title: t('ws-roles.ai'),
      //   permissions: [
      //     {
      //       id: 'ai_chat',
      //       title: t('ws-roles.ai_chat'),
      //       description: t('ws-roles.ai_chat_description'),
      //       disableOnProduction: true,
      //       disabled: true,
      //     },
      //   ],
      // },
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
      {
        id: 'users',
        title: 'Users',
        permissions: [
          {
            id: 'manage_user_report_templates',
            title: t('ws-roles.manage_user_report_templates'),
            description: t('ws-roles.manage_user_report_templates_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
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
        group?.permissions?.filter((p) => p.title && p.description) || []
      ).map((p) => ({
        ...p,
        disabled: p.disableOnProduction ? PROD_MODE : p.disabled,
      })),
    }))
    .filter(
      (group) =>
        group.title && group.permissions && group.permissions.length > 0
    ) as RolePermissionGroup[];
};

export const permissions = ({
  t = (key: string) => key,
  wsId,
}: {
  t?: any;
  wsId: string;
}) => {
  return permissionGroups({ t, wsId }).reduce(
    (acc, group) => acc.concat(group?.permissions || []),
    [] as RolePermission[]
  ) as RolePermission[];
};

export const totalPermissions = (wsId: string) => permissions({ wsId }).length;
