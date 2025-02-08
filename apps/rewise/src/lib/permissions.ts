import { PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { type SupabaseUser } from '@repo/supabase/next/user';
import { PermissionId } from '@repo/types/db';

export type RolePermission = {
  id: PermissionId;
  title: string;
  description: string;
  disableOnProduction?: boolean;
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
  user,
}: {
  t?: any;
  wsId: string;
  user: SupabaseUser | null;
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
          ...(wsId === ROOT_WORKSPACE_ID ||
          user?.email?.endsWith('@tuturuuu.com')
            ? [
                {
                  id: 'manage_workspace_secrets',
                  title: t('ws-roles.manage_workspace_secrets'),
                  description: t(
                    'ws-roles.manage_workspace_secrets_description'
                  ),
                  disableOnProduction: false,
                  disabled: false,
                },
              ]
            : []),
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
      {
        id: 'ai',
        title: t('ws-roles.ai'),
        permissions: [
          {
            id: 'ai_chat',
            title: t('ws-roles.ai_chat'),
            description: t('ws-roles.ai_chat_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'ai_lab',
            title: t('ws-roles.ai_lab'),
            description: t('ws-roles.ai_lab_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'calendar',
        title: t('sidebar_tabs.calendar'),
        permissions: [
          {
            id: 'manage_calendar',
            title: t('ws-roles.manage_calendar'),
            description: t('ws-roles.manage_calendar_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'projects',
        title: t('sidebar_tabs.projects'),
        permissions: [
          {
            id: 'manage_projects',
            title: t('ws-roles.manage_projects'),
            description: t('ws-roles.manage_projects_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'documents',
        title: t('sidebar_tabs.documents'),
        permissions: [
          {
            id: 'manage_documents',
            title: t('ws-roles.manage_documents'),
            description: t('ws-roles.manage_documents_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'drive',
        title: t('sidebar_tabs.drive'),
        permissions: [
          {
            id: 'manage_drive',
            title: t('ws-roles.manage_drive'),
            description: t('ws-roles.manage_drive_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'users',
        title: t('sidebar_tabs.users'),
        permissions: [
          {
            id: 'manage_users',
            title: t('ws-roles.manage_users'),
            description: t('ws-roles.manage_users_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_user_report_templates',
            title: t('ws-roles.manage_user_report_templates'),
            description: t('ws-roles.manage_user_report_templates_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'inventory',
        title: t('sidebar_tabs.inventory'),
        permissions: [
          {
            id: 'manage_inventory',
            title: t('ws-roles.manage_inventory'),
            description: t('ws-roles.manage_inventory_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'finance',
        title: t('sidebar_tabs.finance'),
        permissions: [
          {
            id: 'manage_finance',
            title: t('ws-roles.manage_finance'),
            description: t('ws-roles.manage_finance_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
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

export const permissions = (args: {
  t?: any;
  wsId: string;
  user: SupabaseUser | null;
}) => {
  return permissionGroups(args).reduce(
    (acc, group) => acc.concat(group?.permissions || []),
    [] as RolePermission[]
  ) as RolePermission[];
};

export const totalPermissions = ({
  wsId,
  user,
}: {
  wsId: string;
  user: SupabaseUser | null;
}) => permissions({ wsId, user }).length;
