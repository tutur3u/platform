import {
  Archive,
  Banknote,
  Calendar,
  CalendarCheck,
  CalendarCog,
  ChartBar,
  CircleCheck,
  CircuitBoard,
  Clock,
  CreditCard,
  DatabaseZap,
  Download,
  Edit,
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
  Lock,
  MessageCircleIcon,
  MessagesSquare,
  Newspaper,
  Plus,
  ScrollText,
  Search,
  Send,
  ServerCog,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from '@tuturuuu/icons';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { ReactNode } from 'react';

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
  description?: string;
  permissions: RolePermission[];
};

export const permissionGroups = ({
  t = (key: string) => key,
  wsId,
  user,
}: {
  t?: (key: string) => string;
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
              description: t('ws-roles.infrastructure_description'),
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
                {
                  id: 'manage_changelog',
                  icon: <Newspaper />,
                  title: t('ws-roles.manage_changelog'),
                  description: t('ws-roles.manage_changelog_description'),
                  disableOnProduction: false,
                  disabled: false,
                },
              ],
            },
          ]
        : []),
      {
        id: 'workspace',
        icon: <House />,
        title: t('ws-roles.workspace'),
        description: t('ws-roles.workspace_description'),
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
            id: 'admin',
            icon: <ShieldCheck />,
            title: t('ws-roles.admin'),
            description: t('ws-roles.admin_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_api_keys',
            icon: <KeyRound />,
            title: t('ws-roles.manage_api_keys'),
            description: t('ws-roles.manage_api_keys_description'),
            disableOnProduction: false,
            disabled: false,
          },
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
            id: 'manage_workspace_security',
            icon: <Shield />,
            title: t('ws-roles.manage_workspace_security'),
            description: t('ws-roles.manage_workspace_security_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_e2ee',
            icon: <Lock />,
            title: t('ws-roles.manage_e2ee'),
            description: t('ws-roles.manage_e2ee_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_subscription',
            icon: <CreditCard />,
            title: t('ws-roles.manage_subscription'),
            description: t('ws-roles.manage_subscription_description'),
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
        description: t('ws-roles.ai_description'),
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
        id: 'time-tracker',
        icon: <Clock />,
        title: t('sidebar_tabs.time-tracker'),
        permissions: [
          {
            id: 'manage_time_tracking_requests',
            icon: <MessageCircleIcon />,
            title: t('ws-roles.manage_time_tracking_requests'),
            description: t(
              'ws-roles.manage_time_tracking_requests_description'
            ),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'bypass_time_tracking_request_approval',
            icon: <CircleCheck />,
            title: t('ws-roles.bypass_time_tracking_request_approval'),
            description: t(
              'ws-roles.bypass_time_tracking_request_approval_description'
            ),
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
          {
            id: 'view_users_public_info',
            icon: <Eye />,
            title: t('ws-roles.view_users_public_info'),
            description: t('ws-roles.view_users_public_info_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_users_private_info',
            icon: <UserX />,
            title: t('ws-roles.view_users_private_info'),
            description: t('ws-roles.view_users_private_info_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'create_users',
            icon: <UserPlus />,
            title: t('ws-roles.create_users'),
            description: t('ws-roles.create_users_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_users',
            icon: <UserCog />,
            title: t('ws-roles.update_users'),
            description: t('ws-roles.update_users_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_users',
            icon: <UserMinus />,
            title: t('ws-roles.delete_users'),
            description: t('ws-roles.delete_users_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'check_user_attendance',
            icon: <CalendarCheck />,
            title: t('ws-roles.check_user_attendance'),
            description: t('ws-roles.check_user_attendance_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'user_groups',
        icon: <Users />,
        title: t('ws-roles.user_groups'),
        permissions: [
          {
            id: 'view_user_groups',
            icon: <Eye />,
            title: t('ws-roles.view_user_groups'),
            description: t('ws-roles.view_user_groups_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'create_user_groups',
            icon: <Plus />,
            title: t('ws-roles.create_user_groups'),
            description: t('ws-roles.create_user_groups_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_user_groups',
            icon: <Edit />,
            title: t('ws-roles.update_user_groups'),
            description: t('ws-roles.update_user_groups_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_user_groups',
            icon: <Trash />,
            title: t('ws-roles.delete_user_groups'),
            description: t('ws-roles.delete_user_groups_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_user_groups_scores',
            icon: <ChartBar />,
            title: t('ws-roles.view_user_groups_scores'),
            description: t('ws-roles.view_user_groups_scores_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'create_user_groups_scores',
            icon: <Plus />,
            title: t('ws-roles.create_user_groups_scores'),
            description: t('ws-roles.create_user_groups_scores_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_user_groups_scores',
            icon: <Edit />,
            title: t('ws-roles.update_user_groups_scores'),
            description: t('ws-roles.update_user_groups_scores_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_user_groups_scores',
            icon: <Trash />,
            title: t('ws-roles.delete_user_groups_scores'),
            description: t('ws-roles.delete_user_groups_scores_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_user_groups_posts',
            icon: <Eye />,
            title: t('ws-roles.view_user_groups_posts'),
            description: t('ws-roles.view_user_groups_posts_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'create_user_groups_posts',
            icon: <Plus />,
            title: t('ws-roles.create_user_groups_posts'),
            description: t('ws-roles.create_user_groups_posts_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_user_groups_posts',
            icon: <Edit />,
            title: t('ws-roles.update_user_groups_posts'),
            description: t('ws-roles.update_user_groups_posts_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_user_groups_posts',
            icon: <Trash />,
            title: t('ws-roles.delete_user_groups_posts'),
            description: t('ws-roles.delete_user_groups_posts_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'leads',
        icon: <Users />,
        title: t('ws-roles.leads'),
        permissions: [
          {
            id: 'create_lead_generations',
            icon: <Plus />,
            title: t('ws-roles.create_lead_generations'),
            description: t('ws-roles.create_lead_generations_description'),
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
          // Disabled for now
          // {
          //   id: 'manage_inventory',
          //   icon: <Boxes />,
          //   title: t('ws-roles.manage_inventory'),
          //   description: t('ws-roles.manage_inventory_description'),
          //   disableOnProduction: false,
          //   disabled: false,
          // },
          {
            id: 'create_inventory',
            icon: <Plus />,
            title: t('ws-roles.create_inventory'),
            description: t('ws-roles.create_inventory_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_inventory',
            icon: <Edit />,
            title: t('ws-roles.update_inventory'),
            description: t('ws-roles.update_inventory_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_inventory',
            icon: <Trash />,
            title: t('ws-roles.delete_inventory'),
            description: t('ws-roles.delete_inventory_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_inventory',
            icon: <Search />,
            title: t('ws-roles.view_inventory'),
            description: t('ws-roles.view_inventory_description'),
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
          {
            id: 'view_finance_stats',
            icon: <ChartBar />,
            title: t('ws-roles.view_finance_stats'),
            description: t('ws-roles.view_finance_stats_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'workforce',
        icon: <Users />,
        title: t('sidebar_tabs.workforce'),
        permissions: [
          {
            id: 'manage_workforce',
            icon: <UserCog />,
            title: t('ws-roles.manage_workforce'),
            description: t('ws-roles.manage_workforce_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_workforce',
            icon: <Eye />,
            title: t('ws-roles.view_workforce'),
            description: t('ws-roles.view_workforce_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'manage_payroll',
            icon: <HandCoins />,
            title: t('ws-roles.manage_payroll'),
            description: t('ws-roles.manage_payroll_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_payroll',
            icon: <Eye />,
            title: t('ws-roles.view_payroll'),
            description: t('ws-roles.view_payroll_description'),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'transactions',
        icon: <ScrollText />,
        title: t('ws-roles.transactions'),
        permissions: [
          {
            id: 'create_transactions',
            icon: <Plus />,
            title: t('ws-roles.create_transactions'),
            description: t('ws-roles.create_transactions_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_transactions',
            icon: <Edit />,
            title: t('ws-roles.update_transactions'),
            description: t('ws-roles.update_transactions_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_transactions',
            icon: <Trash />,
            title: t('ws-roles.delete_transactions'),
            description: t('ws-roles.delete_transactions_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_transactions',
            icon: <Search />,
            title: t('ws-roles.view_transactions'),
            description: t('ws-roles.view_transactions_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_confidential_amount',
            icon: <Eye />,
            title: t('ws-roles.view_confidential_amount'),
            description: t('ws-roles.view_confidential_amount_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_confidential_description',
            icon: <Eye />,
            title: t('ws-roles.view_confidential_description'),
            description: t(
              'ws-roles.view_confidential_description_description'
            ),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_confidential_category',
            icon: <Eye />,
            title: t('ws-roles.view_confidential_category'),
            description: t('ws-roles.view_confidential_category_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'create_confidential_transactions',
            icon: <ShieldCheck />,
            title: t('ws-roles.create_confidential_transactions'),
            description: t(
              'ws-roles.create_confidential_transactions_description'
            ),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_confidential_transactions',
            icon: <Lock />,
            title: t('ws-roles.update_confidential_transactions'),
            description: t(
              'ws-roles.update_confidential_transactions_description'
            ),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_confidential_transactions',
            icon: <Trash />,
            title: t('ws-roles.delete_confidential_transactions'),
            description: t(
              'ws-roles.delete_confidential_transactions_description'
            ),
            disableOnProduction: false,
            disabled: false,
          },
        ],
      },
      {
        id: 'invoices',
        icon: <FileText />,
        title: t('ws-roles.invoices'),
        permissions: [
          {
            id: 'create_invoices',
            icon: <Plus />,
            title: t('ws-roles.create_invoices'),
            description: t('ws-roles.create_invoices_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'view_invoices',
            icon: <Search />,
            title: t('ws-roles.view_invoices'),
            description: t('ws-roles.view_invoices_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'update_invoices',
            icon: <Edit />,
            title: t('ws-roles.update_invoices'),
            description: t('ws-roles.update_invoices_description'),
            disableOnProduction: false,
            disabled: false,
          },
          {
            id: 'delete_invoices',
            icon: <Trash />,
            title: t('ws-roles.delete_invoices'),
            description: t('ws-roles.delete_invoices_description'),
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
        disabled: p.disableOnProduction
          ? process.env.NODE_ENV === 'production'
          : p.disabled,
      })),
    }))
    .filter(
      (group) =>
        group.title && group.permissions && group.permissions.length > 0
    ) as RolePermissionGroup[];
};

export const permissions = (args: {
  t?: (key: string) => string;
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
