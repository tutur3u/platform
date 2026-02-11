'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
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
  Star,
  Ticket,
  User,
  Users,
  Wallet,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
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
import DefaultCategorySettings from './finance/default-category-settings';
import DefaultCurrencySettings from './finance/default-currency-settings';
import DefaultWalletSettings from './finance/default-wallet-settings';
import ExperimentalFinanceSettings from './finance/experimental-finance-settings';
import FinanceNavigationSettings from './finance/finance-navigation-settings';
import InvoiceSettings from './finance/invoice-settings';
import InvoiceVisibilitySettings from './finance/invoice-visibility-settings';
import ReferralSettings from './inventory/referral-settings';
import { ReportDefaultTitleSettings } from './reports/report-default-title-settings';
import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import FullNameInput from './settings-full-name-input';
import SidebarSettings from './sidebar-settings';
import { TaskSettings } from './tasks/task-settings';
import { TimeTrackerCategoriesSettings } from './time-tracker/time-tracker-categories-settings';
import { TimeTrackerGeneralSettings } from './time-tracker/time-tracker-general-settings';
import { TimeTrackerGoalsSettings } from './time-tracker/time-tracker-goals-settings';
import { WorkspaceBreakTypesSettings } from './time-tracker/workspace-break-types-settings';
import FeaturedGroupsSettings from './users/featured-groups-settings';
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
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'profile',
  workspace: workspaceProp,
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);

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
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID provided');

      const supabase = createClient();

      // Get current user
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        throw new Error('Not authenticated');
      }

      // Resolve workspace ID (handles "personal", "internal", etc.)
      const resolveResponse = await fetch(
        '/api/v1/infrastructure/resolve-workspace-id',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wsId }),
        }
      );

      if (!resolveResponse.ok) {
        throw new Error('Failed to resolve workspace ID');
      }

      const { workspaceId: resolvedWsId } = await resolveResponse.json();

      // Fetch workspace with resolved ID
      const { data, error } = await supabase
        .from('workspaces')
        .select('*, workspace_members!inner(user_id)')
        .eq('id', resolvedWsId)
        .eq('workspace_members.user_id', currentUser.id)
        .single();

      if (error) {
        throw new Error(
          error.code === 'PGRST116'
            ? t('settings.workspace_not_found_or_no_access')
            : error.message || t('settings.failed_to_load_workspace')
        );
      }

      // Remove the joined data before returning
      const { workspace_members: _, ...workspaceData } = data;
      return workspaceData as Workspace;
    },
    enabled: !workspaceProp && !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use provided workspace or fetched workspace
  const workspace = workspaceProp || fetchedWorkspace || null;

  // Fetch calendar token when workspace is available (using TanStack Query)
  const { data: calendarToken } = useQuery({
    queryKey: ['calendar-token', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;

      const supabase = createClient();
      const { data } = await supabase
        .from('calendar_auth_tokens')
        .select('*')
        .eq('ws_id', workspace.id)
        .maybeSingle();

      return data;
    },
    enabled: !!workspace?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch calendar connections when workspace is available (using TanStack Query)
  const { data: calendarConnections } = useQuery({
    queryKey: ['calendar-connections', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const supabase = createClient();

      const { data, error } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('ws_id', workspace.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching calendar connections:', error);
        throw error;
      }

      return data || [];
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
              {
                name: 'workspace_billing',
                label: t('billing.billing'),
                icon: CreditCard,
                description: t('settings-account.billing-description'),
                keywords: ['Billing', 'Plan', 'Subscription'],
              },
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
                name: 'default_wallet',
                label: t('settings.finance.default_wallet'),
                icon: Wallet,
                description: t('settings.finance.default_wallet_description'),
                keywords: ['Finance', 'Wallet'],
              },
              {
                name: 'default_category',
                label: t('settings.finance.default_category'),
                icon: LayoutGrid,
                description: t('settings.finance.default_category_description'),
                keywords: ['Finance', 'Category', 'Transaction'],
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
            <SecuritySettings user={user} />
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
                  allowEdit={true}
                  isPersonal={workspace.personal}
                />
                <WorkspaceAvatarSettings
                  workspace={workspace}
                  allowEdit={true}
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

        {activeTab === 'workspace_billing' && wsId && (
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
          <div className="h-full">
            <UsersManagementSettings wsId={wsId} />
          </div>
        )}

        {activeTab === 'featured_groups' && wsId && (
          <div className="h-full">
            <FeaturedGroupsSettings wsId={wsId} />
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

        {activeTab === 'default_wallet' && workspace?.id && (
          <DefaultWalletSettings workspaceId={workspace.id} />
        )}

        {activeTab === 'default_category' && workspace?.id && (
          <DefaultCategorySettings workspaceId={workspace.id} />
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

        {activeTab === 'attendance_display' && wsId && (
          <AttendanceDisplaySettings wsId={wsId} />
        )}
      </CalendarSettingsWrapper>
    </SettingsDialogShell>
  );
}
