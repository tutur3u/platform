import { PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { PermissionId } from '@/types/db';
import type { SupabaseUser } from '@repo/supabase/next/user';
import {
  Archive,
  Banknote,
  Boxes,
  Calendar,
  CalendarCog,
  CircleCheck,
  CircuitBoard,
  DatabaseZap,
  Download,
  Eye,
  FileKey2,
  FileText,
  FlaskConical,
  HandCoins,
  HardDrive,
  House,
  KeyRound,
  LayoutTemplate,
  ListTodo,
  MessagesSquare,
  ScrollText,
  Send,
  ServerCog,
  Shield,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { ReactNode } from 'react';

export type RolePermission = {
  id: PermissionId;
  icon?: ReactNode;
  title: string;
  description: string;
  disableOnProduction?: boolean;
  disabled?: boolean;
};

export type RolePermissionGroup = {
  id: string;
  icon?: ReactNode;
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
              icon: <CircuitBoard />,
              title: t('ws-roles.infrastructure'),
              permissions: [
                {
                  id: 'view_infrastructure',
                  icon: <Eye />,
                  title: t('ws-roles.view_infrastructure'),
                  description: t('ws-roles.view_infrastructure_description'),
                  disableOnProduction: false,
                  disabled: false,
                },
                {
                  id: 'manage_external_migrations',
                  icon: <DatabaseZap />,
                  title: t('ws-roles.manage_external_migrations'),
                  description: t(
                    'ws-roles.manage_external_migrations_description'
                  ),
                  disableOnProduction: false,
                  disabled: false,
                },
                {
                  id: 'manage_workspace_audit_logs',
                  icon: <ScrollText />,
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
        icon: <House />,
        title: t('ws-roles.workspace'),
        permissions: [
          ...(wsId === ROOT_WORKSPACE_ID ||
          user?.email?.endsWith('@tuturuuu.com')
            ? [
                {
                  id: 'manage_workspace_secrets',
                  icon: <KeyRound />,
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
          // {
          //   id: 'manage_workspace_settings',
          //   title: t('ws-roles.manage_workspace_settings'),
          //   description: t('ws-roles.manage_workspace_settings_description'),
          //   disableOnProduction: true,
          //   disabled: true,
          // },
          {
            id: 'manage_workspace_security',
            icon: <Shield />,
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
        icon: <Sparkles />,
        title: t('ws-roles.ai'),
        permissions: [
          {
            id: 'ai_chat',
            icon: <MessagesSquare />,
            title: t('ws-roles.ai_chat'),
            description: t('ws-roles.ai_chat_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'ai_lab',
            icon: <FlaskConical />,
            title: t('ws-roles.ai_lab'),
            description: t('ws-roles.ai_lab_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'calendar',
        icon: <Calendar />,
        title: t('sidebar_tabs.calendar'),
        permissions: [
          {
            id: 'manage_calendar',
            icon: <CalendarCog />,
            title: t('ws-roles.manage_calendar'),
            description: t('ws-roles.manage_calendar_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'projects',
        icon: <CircleCheck />,
        title: t('sidebar_tabs.projects'),
        permissions: [
          {
            id: 'manage_projects',
            icon: <ListTodo />,
            title: t('ws-roles.manage_projects'),
            description: t('ws-roles.manage_projects_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'documents',
        icon: <FileText />,
        title: t('sidebar_tabs.documents'),
        permissions: [
          {
            id: 'manage_documents',
            icon: <FileKey2 />,
            title: t('ws-roles.manage_documents'),
            description: t('ws-roles.manage_documents_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'drive',
        icon: <HardDrive />,
        title: t('sidebar_tabs.drive'),
        permissions: [
          {
            id: 'manage_drive',
            icon: <ServerCog />,
            title: t('ws-roles.manage_drive'),
            description: t('ws-roles.manage_drive_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'users',
        icon: <Users />,
        title: t('sidebar_tabs.users'),
        permissions: [
          {
            id: 'manage_users',
            icon: <UserCog />,
            title: t('ws-roles.manage_users'),
            description: t('ws-roles.manage_users_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'export_users_data',
            icon: <Download />,
            title: t('ws-roles.export_users_data'),
            description: t('ws-roles.export_users_data_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'send_user_group_post_emails',
            icon: <Send />,
            title: t('ws-roles.send_user_group_post_emails'),
            description: t('ws-roles.send_user_group_post_emails_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_user_report_templates',
            icon: <LayoutTemplate />,
            title: t('ws-roles.manage_user_report_templates'),
            description: t('ws-roles.manage_user_report_templates_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'inventory',
        icon: <Archive />,
        title: t('sidebar_tabs.inventory'),
        permissions: [
          {
            id: 'manage_inventory',
            icon: <Boxes />,
            title: t('ws-roles.manage_inventory'),
            description: t('ws-roles.manage_inventory_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'finance',
        icon: <Banknote />,
        title: t('sidebar_tabs.finance'),
        permissions: [
          {
            id: 'manage_finance',
            icon: <HandCoins />,
            title: t('ws-roles.manage_finance'),
            description: t('ws-roles.manage_finance_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'export_finance_data',
            icon: <Download />,
            title: t('ws-roles.export_finance_data'),
            description: t('ws-roles.export_finance_data_description'),
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
