'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Clock,
  Coffee,
  CreditCard,
  Laptop,
  Paintbrush,
  Palette,
  PanelLeft,
  Search,
  Shield,
  Ticket,
  User,
  Users,
  Wallet,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { removeAccents } from '@tuturuuu/utils/text-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import WorkspaceAvatarSettings from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/avatar';
import BasicInfo from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/basic-info';
import UserAvatar from '../../app/[locale]/settings-avatar';
import DisplayNameInput from '../../app/[locale]/settings-display-name-input';
import EmailInput from '../../app/[locale]/settings-email-input';
import BillingSettings from './account/billing-settings';
import MyWorkspacesSettings from './account/my-workspaces-settings';
import NotificationSettings from './account/notification-settings';
import SecuritySettings from './account/security-settings';
import SessionSettings from './account/session-settings';
import AppearanceSettings from './appearance-settings';
import AttendanceDisplaySettings from './attendance/attendance-display-settings';
import { CalendarSettingsContent } from './calendar/calendar-settings-content';
import { CalendarSettingsWrapper } from './calendar/calendar-settings-wrapper';
import DefaultWalletSettings from './finance/default-wallet-settings';
import InvoiceSettings from './finance/invoice-settings';
import ReferralSettings from './inventory/referral-settings';
import SidebarSettings from './sidebar-settings';
import { TaskSettings } from './tasks/task-settings';
import { TimeTrackerGeneralSettings } from './time-tracker/time-tracker-general-settings';
import { WorkspaceBreakTypesSettings } from './time-tracker/workspace-break-types-settings';
import UsersManagementSettings from './users/users-management-settings';
import MembersSettings from './workspace/members-settings';
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
  const { isMac, modKey } = usePlatform();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');

  // User preference for expanding all settings accordions
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    false
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
      const { workspace_members: _, ...workspaceData } = data as any;
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
                name: 'billing',
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
                icon: Palette,
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
                name: 'default_wallet',
                label: t('settings.finance.default_wallet'),
                icon: Wallet,
                description: t('settings.finance.default_wallet_description'),
                keywords: ['Finance', 'Wallet'],
              },
              {
                name: 'invoice_settings',
                label: t('settings.finance.invoice_settings'),
                icon: CreditCard,
                description: t('settings.finance.invoice_settings_description'),
                keywords: ['Finance', 'Invoice', 'Attendance', 'Promotions'],
              },
            ],
          },
        ]
      : []),
  ];

  // Determine the active group name for breadcrumbs
  const activeGroup = navItems.find((g) =>
    g.items.some((i) => i.name === activeTab)
  );

  const activeItem =
    navItems.flatMap((g) => g.items).find((i) => i.name === activeTab) ||
    navItems[0]?.items[0];

  const filteredNavItems = navItems
    .map((group) => {
      const normalizedQuery = removeAccents(searchQuery.toLowerCase());
      const filteredItems = group.items.filter(
        (item) =>
          removeAccents(item.label.toLowerCase()).includes(normalizedQuery) ||
          (item.description &&
            removeAccents(item.description.toLowerCase()).includes(
              normalizedQuery
            )) ||
          item.keywords?.some((keyword) =>
            removeAccents(keyword.toLowerCase()).includes(normalizedQuery)
          )
      );
      return { ...group, items: filteredItems };
    })
    .filter((group) => group.items.length > 0);

  return (
    <DialogContent className="flex h-[80vh] flex-col overflow-hidden p-0 md:max-h-200 md:max-w-225 lg:max-h-250 lg:max-w-250 xl:max-w-300">
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <SidebarProvider className="flex h-full min-h-0 items-start">
        <Sidebar
          collapsible="none"
          className="hidden h-full w-64 flex-col border-r bg-muted/30 md:flex"
        >
          <SidebarHeader className="z-10 p-4 pb-0">
            <div className="relative mb-2">
              <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
              <SidebarInput
                placeholder={t('search.search')}
                className="bg-background pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Detected OS: {isMac ? 'macOS' : 'Windows/Linux'} ({modKey})
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="overflow-y-auto p-4">
            {filteredNavItems.map((group) => (
              <Collapsible
                key={`${group.label}-${searchQuery ? 'search' : 'browse'}-${expandAllAccordions ? 'expanded' : 'collapsed'}`}
                defaultOpen={
                  expandAllAccordions ||
                  !!searchQuery ||
                  group.label === navItems[0]?.label
                }
                open={expandAllAccordions ? true : undefined}
                className="group/collapsible"
              >
                <SidebarGroup className="p-0">
                  <SidebarGroupLabel
                    asChild
                    className="group/label w-full cursor-pointer text-sidebar-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <CollapsibleTrigger>
                      {group.label}
                      <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.name}>
                            <SidebarMenuButton
                              isActive={activeTab === item.name}
                              onClick={() => setActiveTab(item.name)}
                              className={cn(
                                'h-9 w-full justify-start px-2 transition-colors',
                                activeTab === item.name
                                  ? 'bg-accent font-medium text-accent-foreground'
                                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                              )}
                            >
                              <item.icon className="mr-2 h-4 w-4" />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ))}
          </SidebarContent>
        </Sidebar>
        <main className="flex h-full flex-1 flex-col overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#" className="pointer-events-none">
                      {t('common.settings')}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  {activeGroup && (
                    <>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbPage className="text-muted-foreground">
                          {activeGroup.label}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                    </>
                  )}
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeItem?.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="space-y-1">
                <h2 className="font-semibold text-lg tracking-tight">
                  {activeItem?.label}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {activeItem?.description ||
                    t('settings.manage_settings', {
                      label: activeItem?.label?.toLowerCase() ?? '',
                    })}
                </p>
              </div>
              <Separator />

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
                      <Separator />
                      <SettingItemTab
                        title={t('settings-account.display-name')}
                        description={t(
                          'settings-account.display-name-description'
                        )}
                      >
                        <DisplayNameInput defaultValue={user?.display_name} />
                      </SettingItemTab>
                      <Separator />
                      <SettingItemTab
                        title="Email"
                        description={t('settings-account.email-description')}
                      >
                        <EmailInput
                          oldEmail={user.email}
                          newEmail={user.new_email}
                        />
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

                {activeTab === 'billing' && (
                  <div className="h-full">
                    <BillingSettings />
                  </div>
                )}

                {activeTab === 'default_wallet' && wsId && (
                  <DefaultWalletSettings wsId={wsId} />
                )}

                {activeTab === 'invoice_settings' && wsId && (
                  <InvoiceSettings wsId={wsId} />
                )}

                {activeTab === 'referrals' && wsId && (
                  <ReferralSettings wsId={wsId} />
                )}

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

                {activeTab === 'time_tracker_general' && wsId && (
                  <TimeTrackerGeneralSettings wsId={wsId} />
                )}

                {activeTab === 'attendance_display' && wsId && (
                  <AttendanceDisplaySettings wsId={wsId} />
                )}
              </CalendarSettingsWrapper>
            </div>
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
