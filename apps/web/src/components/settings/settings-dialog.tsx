'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Brain,
  Building,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  Coffee,
  Coins,
  Compass,
  CreditCard,
  FileText,
  FlaskConical,
  Goal,
  HandCoins,
  Laptop,
  LayoutGrid,
  Paintbrush,
  PanelLeft,
  Shield,
  Sparkles,
  Star,
  Ticket,
  User,
  Users,
} from '@tuturuuu/icons';
import {
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  parseWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import type {
  CalendarConnection,
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { apiFetch } from '@/lib/api-fetch';
import WorkspaceAvatarSettings from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/avatar';
import BasicInfo from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/basic-info';
import AccountManagementSettings from './account/account-management-settings';
import AccountStatusSection from './account/account-status-section';
import NotificationSettings from './account/notification-settings';
import SecuritySettings from './account/security-settings';
import SessionSettings from './account/session-settings';
import AppearanceSettings from './appearance-settings';
import { ApprovalsSettings } from './approvals/approvals-settings';
import AttendanceDisplaySettings from './attendance/attendance-display-settings';
import { CalendarSettingsContent } from './calendar/calendar-settings-content';
import { CalendarSettingsWrapper } from './calendar/calendar-settings-wrapper';
import DebtLoanSettings from './finance/debt-loan-settings';
import DefaultCurrencySettings from './finance/default-currency-settings';
import ExperimentalFinanceSettings from './finance/experimental-finance-settings';
import FinanceNavigationSettings from './finance/finance-navigation-settings';
import InvoiceSettings from './finance/invoice-settings';
import InvoiceVisibilitySettings from './finance/invoice-visibility-settings';
import TransactionDefaultsSettings from './finance/transaction-defaults-settings';
import { FormsAutosaveSettings } from './forms/forms-autosave-settings';
import ReferralSettings from './inventory/referral-settings';
import { MiraMemorySettings } from './mira/mira-memory-settings';
import { MiraPersonalitySettings } from './mira/mira-personality-settings';
import { ReportDefaultTitleSettings } from './reports/report-default-title-settings';
import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import FullNameInput from './settings-full-name-input';
import UserIdInput from './settings-user-id-input';
import SidebarSettings from './sidebar-settings';
import { TaskSettings } from './tasks/task-settings';
import { TimeTrackerCategoriesSettings } from './time-tracker/time-tracker-categories-settings';
import { TimeTrackerGeneralSettings } from './time-tracker/time-tracker-general-settings';
import { TimeTrackerGoalsSettings } from './time-tracker/time-tracker-goals-settings';
import { TimeTrackerRequestsSettings } from './time-tracker/time-tracker-requests-settings';
import { WorkspaceBreakTypesSettings } from './time-tracker/workspace-break-types-settings';
import { DatabaseDefaultFiltersSettings } from './users/database-default-filters-settings';
import FeaturedGroupsSettings from './users/featured-groups-settings';
import { RequireAttentionColorSettings } from './users/require-attention-color-settings';
import UsersManagementSettings from './users/users-management-settings';
import BillingSettings from './workspace/billing-settings';
import MembersSettings from './workspace/members-settings';
import MyWorkspacesSettings from './workspace/my-workspaces-settings';
import UserStatusSettings from './workspace/user-status-settings';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
  workspace?: Workspace | null;
  linkedProvider?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'profile',
  workspace: workspaceProp,
  linkedProvider,
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const {
    data: workspaceCustomConfigs = {},
    isLoading: isLoadingWorkspaceCustomConfigs,
  } = useWorkspaceConfigs(
    wsId ?? '',
    wsId
      ? [
          DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
          DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
          DATABASE_FEATURED_GROUPS_CONFIG_ID,
        ]
      : []
  );

  // User preference for expanding all settings accordions
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  // Fetch workspace data if not provided (using TanStack Query)
  const {
    data: fetchedWorkspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: () => {
      if (!wsId) throw new Error('No workspace ID provided');
      return apiFetch<Workspace>(`/api/workspaces/${wsId}`, {
        cache: 'no-store',
      });
    },
    enabled: !workspaceProp && !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use provided workspace or fetched workspace
  const workspace = workspaceProp || fetchedWorkspace || null;

  const { data: workspacePermissions, isLoading: isBillingPermissionLoading } =
    useQuery({
      queryKey: ['workspace-settings-permissions', wsId],
      queryFn: () =>
        apiFetch<{
          manage_subscription: boolean;
          manage_workspace_settings: boolean;
        }>(`/api/v1/workspaces/${wsId}/settings/permissions`, {
          cache: 'no-store',
        }),
      enabled: !!wsId,
      staleTime: 5 * 60 * 1000,
    });

  const hasBillingPermission =
    workspacePermissions?.manage_subscription ?? false;
  const canManageWorkspaceSettings =
    workspacePermissions?.manage_workspace_settings ?? false;
  const autoAddNewGroupsToDefaultIncludedGroups =
    workspaceCustomConfigs[
      DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    ] === 'true';
  const defaultExcludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID]
  );
  const defaultIncludedGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID]
  );
  const featuredGroupIds = parseWorkspaceConfigIdList(
    workspaceCustomConfigs[DATABASE_FEATURED_GROUPS_CONFIG_ID]
  );

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // Reset activeTab if billing permission is revoked or not available
  useEffect(() => {
    if (
      !isBillingPermissionLoading &&
      hasBillingPermission === false &&
      activeTab === 'workspace_billing'
    ) {
      const safeFallback =
        defaultTab === 'workspace_billing'
          ? 'profile'
          : (defaultTab ?? 'profile');
      setActiveTab(safeFallback);
    }
  }, [hasBillingPermission, isBillingPermissionLoading, activeTab, defaultTab]);

  // Fetch calendar token when workspace is available (using TanStack Query)
  const { data: calendarToken } = useQuery({
    queryKey: ['calendar-token', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;

      const response = await fetch(
        `/api/v1/calendar/auth/tokens?wsId=${workspace.id}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch calendar token');
      }

      const payload = (await response.json()) as {
        tokens?: WorkspaceCalendarGoogleToken | null;
      };

      return payload.tokens ?? null;
    },
    enabled: !!workspace?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch calendar connections when workspace is available (using TanStack Query)
  const { data: calendarConnections } = useQuery({
    queryKey: ['calendar-connections', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const response = await fetch(
        `/api/v1/calendar/connections?wsId=${workspace.id}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch calendar connections');
      }

      const payload = (await response.json()) as {
        connections?: CalendarConnection[];
      };

      return payload.connections ?? [];
    },
    enabled: !!workspace?.id,
    staleTime: 30 * 1000, // 30 seconds for fresh data
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const navItems = [
    {
      label: t('settings.user.title'),
      items: [
        {
          name: 'profile',
          label: t('settings.user.profile'),
          icon: User,
          description: t('settings.user.profile_description'),
          keywords: ['Profile'],
        },
        {
          name: 'security',
          label: t('ws-settings.security'),
          icon: Shield,
          description: t('settings-account.security-description'),
          keywords: ['Security'],
        },
        {
          name: 'sessions',
          label: t('settings.user.sessions'),
          icon: Laptop,
          description: t('settings.user.sessions_description'),
          keywords: ['Sessions', 'Devices'],
        },
        {
          name: 'accounts',
          label: t('settings-nav.accounts.name'),
          icon: Users,
          description: t('settings-nav.accounts.description'),
          keywords: ['Accounts'],
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          name: 'appearance',
          label: t('settings.preferences.appearance'),
          icon: Paintbrush,
          description: wsId
            ? t('settings.preferences.appearance_ws_description')
            : t('settings-account.appearance-description'),
          keywords: ['Appearance', 'Theme'],
        },
        {
          name: 'notifications',
          label: t('settings.preferences.notifications'),
          icon: Bell,
          description: wsId
            ? t('settings.preferences.notifications_ws_description')
            : 'Manage your notification preferences',
          keywords: ['Notifications'],
        },
        {
          name: 'sidebar',
          label: t('settings.preferences.sidebar'),
          icon: PanelLeft,
          description: t('settings.preferences.sidebar_description'),
          keywords: ['Sidebar', 'Navigation', 'Menu'],
        },
        {
          name: 'forms',
          label: t('settings.preferences.forms'),
          icon: FileText,
          description: t('settings.preferences.forms_description'),
          keywords: ['Forms', 'Auto-save', 'Form builder'],
        },
      ],
    },
    {
      label: t('settings.tasks.title'),
      items: [
        {
          name: 'tasks_general',
          label: t('settings.tasks.general'),
          icon: CheckSquare,
          description: t('settings.tasks.general_description'),
          keywords: ['Tasks', 'General'],
        },
      ],
    },
    {
      label: t('settings.mira.title'),
      items: [
        {
          name: 'mira_personality',
          label: t('settings.mira.personality'),
          icon: Sparkles,
          description: t('settings.mira.personality_description'),
          keywords: ['Mira', 'AI', 'Personality', 'Soul', 'Assistant'],
        },
        {
          name: 'mira_memories',
          label: t('settings.mira.memories'),
          icon: Brain,
          description: t('settings.mira.memories_description'),
          keywords: ['Mira', 'Memory', 'Remember', 'Facts'],
        },
      ],
    },
    ...(wsId
      ? [
          {
            label: t('settings.user_management.title'),
            items: [
              {
                name: 'database_filters',
                label: t('settings.user_management.database_filters'),
                icon: Users,
                description: t(
                  'settings.user_management.database_filters_description'
                ),
                keywords: [
                  'Users',
                  'Database',
                  'Filters',
                  'Groups',
                  'Excluded',
                ],
              },
              {
                name: 'featured_groups',
                label: t('settings.user_management.featured_groups'),
                icon: Star,
                description: t(
                  'settings.user_management.featured_groups_description'
                ),
                keywords: ['Featured', 'Groups', 'Quick', 'Filter', 'Pinned'],
              },
              {
                name: 'require_attention_color',
                label: t('settings.user_management.require_attention_color'),
                icon: Paintbrush,
                description: t(
                  'settings.user_management.require_attention_color_description'
                ),
                keywords: ['Users', 'Feedback', 'Attention', 'Color'],
              },
              {
                name: 'approvals',
                label: t('settings.approvals.title'),
                icon: ClipboardList,
                description: t('settings.approvals.description'),
                keywords: ['Approvals', 'Posts', 'Reports'],
              },
            ],
          },
          {
            label: t('settings.reports.title'),
            items: [
              {
                name: 'report_default_title',
                label: t('settings.reports.default_title'),
                icon: FileText,
                description: t('settings.reports.default_title_description'),
                keywords: ['Reports', 'Templates', 'Title', 'Default'],
              },
            ],
          },
        ]
      : []),
    {
      label: t('settings.workspaces.title'),
      items: [
        {
          name: 'workspaces',
          label: wsId
            ? t('settings.workspaces.overview')
            : t('settings.workspaces.all_workspaces'),
          icon: Building,
          description: wsId
            ? t('settings.workspaces.manage_current')
            : t('settings.workspaces.manage_all'),
          keywords: ['Workspaces', 'Overview', 'All Workspaces'],
        },
        ...(wsId
          ? [
              {
                name: 'workspace_general',
                label: t('settings.workspaces.general'),
                icon: Building,
                description: t('ws-settings.general-description'),
                keywords: ['Workspace', 'General'],
              },
              {
                name: 'workspace_members',
                label: t('settings.workspaces.members'),
                icon: Users,
                description: t('ws-settings.members-description'),
                keywords: ['Members', 'Team'],
              },
              ...(hasBillingPermission
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
              {
                name: 'user_status',
                label: t('settings.workspaces.user_status'),
                icon: Users,
                description: t('settings.workspaces.user_status_description'),
                keywords: ['User Status'],
              },
            ]
          : []),
      ],
    },
    ...(wsId
      ? [
          {
            label: t('settings.calendar.title'),
            items: [
              {
                name: 'calendar_hours',
                label: t('settings.calendar.hours'),
                icon: Clock,
                description: t('settings.calendar.hours_description'),
                keywords: ['Calendar', 'Hours', 'Timezone'],
              },
              {
                name: 'calendar_colors',
                label: t('settings.calendar.colors'),
                icon: LayoutGrid,
                description: t('settings.calendar.colors_description'),
                keywords: ['Calendar', 'Colors', 'Categories'],
              },
              {
                name: 'calendar_google',
                label: t('settings.calendar.integrations'),
                icon: CalendarDays,
                description: t('settings.calendar.integrations_description'),
                keywords: ['Calendar', 'Integrations', 'Google'],
              },
            ],
          },
          {
            label: t('settings.time_tracker.title'),
            items: [
              {
                name: 'time_tracker_general',
                label: t('settings.time_tracker.general'),
                icon: Clock,
                description: t('settings.time_tracker.general_description'),
                keywords: ['Time Tracker', 'General', 'Future'],
              },
              {
                name: 'time_tracker_categories',
                label: t('settings.time_tracker.categories'),
                icon: LayoutGrid,
                description: t('settings.time_tracker.categories_description'),
                keywords: ['Time Tracker', 'Categories'],
              },
              {
                name: 'time_tracker_goals',
                label: t('settings.time_tracker.goals'),
                icon: Goal,
                description: t('settings.time_tracker.goals_description'),
                keywords: ['Time Tracker', 'Goals', 'Productivity'],
              },
              {
                name: 'time_tracker_requests',
                label: t('settings.time_tracker.requests'),
                icon: ClipboardList,
                description: t('settings.time_tracker.requests_description'),
                keywords: ['Time Tracker', 'Requests', 'Threshold'],
              },
              {
                name: 'break_types',
                label: t('settings.time_tracker.break_types'),
                icon: Coffee,
                description: t('settings.time_tracker.break_types_description'),
                keywords: ['Time Tracker', 'Breaks'],
              },
            ],
          },
          {
            label: t('settings.attendance.title'),
            items: [
              {
                name: 'attendance_display',
                label: t('settings.attendance.display'),
                icon: ClipboardList,
                description: t('settings.attendance.display_description'),
                keywords: ['Attendance', 'Display', 'Members', 'Managers'],
              },
            ],
          },
          {
            label: t('common.inventory'),
            items: [
              {
                name: 'referrals',
                label: t('inventory.referral_reward_type'),
                icon: Ticket,
                description: t('user-data-table.referral_settings_desc'),
                keywords: ['Referral', 'Promotion', 'Reward'],
              },
            ],
          },
          {
            label: t('settings.finance.title'),
            items: [
              {
                name: 'finance_navigation',
                label: t('settings.finance.navigation'),
                icon: Compass,
                description: t('settings.finance.navigation_description'),
                keywords: ['Finance', 'Navigation', 'Default', 'Route'],
              },
              {
                name: 'invoice_visibility',
                label: t('settings.finance.invoice_visibility'),
                icon: FileText,
                description: t(
                  'settings.finance.invoice_visibility_description'
                ),
                keywords: ['Finance', 'Invoice', 'Visibility', 'Show', 'Hide'],
              },
              {
                name: 'transaction_defaults',
                label: t('settings.finance.transaction_defaults'),
                icon: LayoutGrid,
                description: t(
                  'settings.finance.transaction_defaults_description'
                ),
                keywords: [
                  'Finance',
                  'Wallet',
                  'Category',
                  'Transaction',
                  'Defaults',
                ],
              },
              {
                name: 'default_currency',
                label: t('settings.finance.default_currency'),
                icon: Coins,
                description: t('settings.finance.default_currency_description'),
                keywords: ['Finance', 'Currency', 'VND', 'USD'],
              },
              {
                name: 'invoice_settings',
                label: t('settings.finance.invoice_settings'),
                icon: CreditCard,
                description: t('settings.finance.invoice_settings_description'),
                keywords: ['Finance', 'Invoice', 'Attendance', 'Promotions'],
              },
              {
                name: 'debt_loan_categories',
                label: t('settings.finance.debt_loan_categories'),
                icon: HandCoins,
                description: t(
                  'settings.finance.debt_loan_categories_description'
                ),
                keywords: ['Finance', 'Debt', 'Loan', 'Borrow', 'Lend'],
              },
              {
                name: 'experimental_finance',
                label: t('ws-finance-settings.experimental_title'),
                icon: FlaskConical,
                description: t('ws-finance-settings.experimental_description'),
                keywords: ['Experimental', 'Finance', 'Momo', 'ZaloPay'],
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <SettingsDialogShell
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      expandAllAccordions={expandAllAccordions}
    >
      <CalendarSettingsWrapper
        wsId={wsId}
        initialSettings={
          workspace
            ? {
                timezone: {
                  timezone: workspace.timezone || 'auto',
                  showSecondaryTimezone: false,
                },
              }
            : undefined
        }
      >
        {activeTab === 'profile' && user && (
          <div className="space-y-8">
            <div className="grid gap-6">
              <SettingItemTab
                title={t('settings-account.avatar')}
                description={t('settings-account.avatar-description')}
              >
                <UserAvatar user={user} />
              </SettingItemTab>
              <AccountStatusSection user={user} />
              <Separator />
              <SettingItemTab
                title={t('settings-account.user-id')}
                description={t('settings-account.user-id-description')}
              >
                <UserIdInput userId={user.id} />
              </SettingItemTab>
              <SettingItemTab
                title={t('settings-account.display-name')}
                description={t('settings-account.display-name-description')}
              >
                <DisplayNameInput defaultValue={user?.display_name} />
              </SettingItemTab>
              <SettingItemTab
                title={t('settings-account.full-name')}
                description={t('settings-account.full-name-description')}
              >
                <FullNameInput defaultValue={user?.full_name} />
              </SettingItemTab>
              <SettingItemTab
                title="Email"
                description={t('settings-account.email-description')}
              >
                <EmailInput oldEmail={user.email} newEmail={user.new_email} />
              </SettingItemTab>
            </div>
          </div>
        )}

        {activeTab === 'security' && user && (
          <div className="h-full">
            <SecuritySettings user={user} linkedProvider={linkedProvider} />
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="h-full">
            <SessionSettings />
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="h-full">
            <AccountManagementSettings />
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="h-full">
            <AppearanceSettings />
          </div>
        )}

        {activeTab === 'sidebar' && (
          <div className="h-full">
            <SidebarSettings />
          </div>
        )}

        {activeTab === 'forms' && (
          <div className="h-full">
            <FormsAutosaveSettings />
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="h-full">
            <NotificationSettings />
          </div>
        )}

        {activeTab === 'tasks_general' && (
          <div className="h-full">
            <TaskSettings workspace={workspace} />
          </div>
        )}

        {activeTab === 'mira_personality' && (
          <div className="h-full">
            <MiraPersonalitySettings />
          </div>
        )}

        {activeTab === 'mira_memories' && (
          <div className="h-full">
            <MiraMemorySettings />
          </div>
        )}

        {activeTab === 'workspaces' && user && (
          <div className="h-full">
            <MyWorkspacesSettings user={user} workspace={workspace} />
          </div>
        )}

        {activeTab === 'workspace_general' && (
          <div className="space-y-8">
            {isLoadingWorkspace ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="mt-4 text-muted-foreground text-sm">
                    {t('settings.loading_workspace')}
                  </p>
                </div>
              </div>
            ) : workspaceError ? (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                <p className="font-medium text-destructive">
                  {t('settings.failed_to_load_workspace')}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {workspaceError.message ||
                    t('settings.error_loading_workspace')}
                </p>
              </div>
            ) : workspace ? (
              <>
                <BasicInfo
                  workspace={workspace}
                  allowEdit={!workspace.personal && canManageWorkspaceSettings}
                  isPersonal={workspace.personal}
                />
                <WorkspaceAvatarSettings
                  user={user}
                  workspace={workspace}
                  allowEdit={!workspace.personal && canManageWorkspaceSettings}
                />
              </>
            ) : (
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">
                  {t('settings.workspace_not_found')}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'workspace_members' && (
          <div className="h-full">
            {isLoadingWorkspace ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="mt-4 text-muted-foreground text-sm">
                    {t('settings.loading_workspace')}
                  </p>
                </div>
              </div>
            ) : workspaceError ? (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                <p className="font-medium text-destructive">
                  {t('settings.failed_to_load_workspace')}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {workspaceError.message ||
                    t('settings.error_loading_workspace')}
                </p>
              </div>
            ) : workspace ? (
              <MembersSettings workspace={workspace} />
            ) : (
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">
                  {t('settings.workspace_not_found')}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'workspace_billing' && wsId && hasBillingPermission && (
          <div className="h-full">
            <BillingSettings wsId={wsId} />
          </div>
        )}

        {activeTab === 'user_status' && wsId && (
          <div className="h-full">
            <UserStatusSettings wsId={wsId} />
          </div>
        )}

        {activeTab === 'database_filters' && wsId && (
          <div className="space-y-8">
            <DatabaseDefaultFiltersSettings />
            <UsersManagementSettings
              wsId={wsId}
              initialIncludedGroupIds={defaultIncludedGroupIds}
              initialSelectedGroupIds={defaultExcludedGroupIds}
              initialAutoAddNewGroupsToDefaultIncludedGroups={
                autoAddNewGroupsToDefaultIncludedGroups
              }
              isConfigLoading={isLoadingWorkspaceCustomConfigs}
            />
          </div>
        )}

        {activeTab === 'featured_groups' && wsId && (
          <div className="h-full">
            <FeaturedGroupsSettings
              wsId={wsId}
              initialSelectedGroupIds={featuredGroupIds}
              isConfigLoading={isLoadingWorkspaceCustomConfigs}
            />
          </div>
        )}

        {activeTab === 'require_attention_color' && (
          <div className="h-full">
            <RequireAttentionColorSettings />
          </div>
        )}

        {activeTab === 'approvals' && wsId && (
          <div className="h-full">
            <ApprovalsSettings wsId={wsId} />
          </div>
        )}

        {activeTab === 'report_default_title' && workspace?.id && (
          <ReportDefaultTitleSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'finance_navigation' && workspace?.id && (
          <FinanceNavigationSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'invoice_visibility' && workspace?.id && (
          <InvoiceVisibilitySettings
            workspaceId={workspace.id}
            isPersonalWorkspace={workspace.personal}
          />
        )}

        {activeTab === 'transaction_defaults' && workspace?.id && (
          <TransactionDefaultsSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'default_currency' && workspace?.id && (
          <DefaultCurrencySettings workspaceId={workspace.id} />
        )}

        {activeTab === 'invoice_settings' && workspace?.id && (
          <InvoiceSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'debt_loan_categories' && workspace?.id && (
          <DebtLoanSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'experimental_finance' && workspace?.id && (
          <ExperimentalFinanceSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'referrals' && wsId && <ReferralSettings wsId={wsId} />}

        {activeTab.startsWith('calendar_') && wsId && (
          <CalendarSettingsContent
            section={activeTab}
            wsId={wsId}
            workspace={workspace}
            calendarToken={calendarToken}
            calendarConnections={calendarConnections || []}
          />
        )}

        {activeTab === 'break_types' && wsId && (
          <WorkspaceBreakTypesSettings wsId={wsId} />
        )}

        {activeTab === 'time_tracker_categories' && wsId && (
          <TimeTrackerCategoriesSettings wsId={wsId} />
        )}

        {activeTab === 'time_tracker_goals' && wsId && (
          <TimeTrackerGoalsSettings wsId={wsId} />
        )}

        {activeTab === 'time_tracker_general' && wsId && (
          <TimeTrackerGeneralSettings wsId={wsId} />
        )}

        {activeTab === 'time_tracker_requests' && wsId && (
          <TimeTrackerRequestsSettings
            wsId={wsId}
            canManageWorkspaceSettings={canManageWorkspaceSettings}
          />
        )}

        {activeTab === 'attendance_display' && wsId && (
          <AttendanceDisplaySettings wsId={wsId} />
        )}
      </CalendarSettingsWrapper>
    </SettingsDialogShell>
  );
}
