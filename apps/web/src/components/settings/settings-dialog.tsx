'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building,
  CalendarDays,
  CheckSquare,
  Clock,
  Coffee,
  CreditCard,
  Laptop,
  Paintbrush,
  Palette,
  Shield,
  Sparkles,
  User,
  Users,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { CalendarSettingsContent } from './calendar/calendar-settings-content';
import { CalendarSettingsWrapper } from './calendar/calendar-settings-wrapper';
import { TaskSettings } from './tasks/task-settings';
import { WorkspaceBreakTypesSettings } from './time-tracker/workspace-break-types-settings';
import MembersSettings from './workspace/members-settings';

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
            ? 'Workspace not found or you do not have access'
            : error.message || 'Failed to load workspace'
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
      label: 'User Settings',
      items: [
        {
          name: 'profile',
          label: 'Profile',
          icon: User,
          description: 'Manage your profile information',
        },
        {
          name: 'security',
          label: t('ws-settings.security'),
          icon: Shield,
          description: t('settings-account.security-description'),
        },
        {
          name: 'sessions',
          label: 'Sessions & Devices',
          icon: Laptop,
          description: 'Manage your active sessions and devices',
        },
      ],
    },
    {
      label: 'Preferences',
      items: [
        {
          name: 'appearance',
          label: 'Appearance & Theme',
          icon: Paintbrush,
          description: wsId
            ? 'Customize the look and feel of your interface and calendar'
            : t('settings-account.appearance-description'),
        },
        {
          name: 'notifications',
          label: 'Notifications',
          icon: Bell,
          description: wsId
            ? 'Manage your notification preferences including calendar notifications'
            : 'Manage your notification preferences',
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
        },
      ],
    },
    {
      label: 'My Workspaces',
      items: [
        {
          name: 'workspaces',
          label: wsId ? 'Overview' : 'All Workspaces',
          icon: Building,
          description: wsId
            ? 'Manage current workspace settings'
            : 'Manage your workspaces',
        },
        ...(wsId
          ? [
              {
                name: 'workspace_general',
                label: 'General',
                icon: Building,
                description: t('ws-settings.general-description'),
              },
              {
                name: 'workspace_members',
                label: 'Members',
                icon: Users,
                description: t('ws-settings.members-description'),
              },
              {
                name: 'billing',
                label: t('billing.billing'),
                icon: CreditCard,
                description: t('settings-account.billing-description'),
              },
            ]
          : []),
      ],
    },
    ...(wsId
      ? [
          {
            label: 'Calendar',
            items: [
              {
                name: 'calendar_hours',
                label: 'Hours & Timezone',
                icon: Clock,
                description:
                  'Configure your work hours, meeting hours, and timezone',
              },
              {
                name: 'calendar_colors',
                label: 'Category Colors',
                icon: Palette,
                description: 'Customize colors for different event categories',
              },
              {
                name: 'calendar_google',
                label: 'Integrations',
                icon: CalendarDays,
                description: 'Connect your Google Calendar and other services',
              },
              {
                name: 'calendar_smart',
                label: 'Smart Features',
                icon: Sparkles,
                description:
                  'Configure AI-powered scheduling and task management',
              },
            ],
          },
          {
            label: 'Time Tracker',
            items: [
              {
                name: 'break_types',
                label: 'Break Types',
                icon: Coffee,
                description:
                  'Manage and customize break types for your workspace',
              },
            ],
          },
        ]
      : []),
  ];

  const activeItem =
    navItems.flatMap((g) => g.items).find((i) => i.name === activeTab) ||
    navItems[0]?.items[0];

  return (
    <DialogContent className="flex h-full flex-col overflow-hidden p-0 md:max-h-[800px] md:max-w-[1000px] lg:max-w-[1200px]">
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <SidebarProvider className="flex h-full w-full flex-1 items-start min-h-0">
        <Sidebar
          collapsible="none"
          className="hidden h-full w-64 flex-col border-r bg-muted/30 md:flex"
        >
          <SidebarContent className="overflow-y-auto p-4">
            {navItems.map((group) => (
              <SidebarGroup key={group.label} className="p-0">
                <SidebarGroupLabel className="px-2 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  {group.label}
                </SidebarGroupLabel>
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
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <main className="flex h-[calc(100%-5rem)] flex-1 flex-col overflow-hidden bg-background 2xl:h-[calc(100%-10rem)]">
          <header className="flex h-20 shrink-0 flex-col items-start justify-center gap-1 overflow-hidden border-b bg-background/80 px-4 py-2 backdrop-blur-md">
            <h2 className="font-semibold text-lg tracking-tight">
              {activeItem?.label}
            </h2>
            <p className="text-muted-foreground text-sm">
              {activeItem?.description ||
                `Manage your ${activeItem?.label.toLowerCase()} settings`}
            </p>
          </header>
          <div className="flex h-32 grow flex-col gap-4 overflow-y-auto p-6 pb-20">
            <div className="mx-auto w-full max-w-3xl">
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
                            Loading workspace...
                          </p>
                        </div>
                      </div>
                    ) : workspaceError ? (
                      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                        <p className="font-medium text-destructive">
                          Failed to load workspace
                        </p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {workspaceError.message ||
                            'An error occurred while loading the workspace'}
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
                          Workspace not found
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
                            Loading workspace...
                          </p>
                        </div>
                      </div>
                    ) : workspaceError ? (
                      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                        <p className="font-medium text-destructive">
                          Failed to load workspace
                        </p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {workspaceError.message ||
                            'An error occurred while loading the workspace'}
                        </p>
                      </div>
                    ) : workspace ? (
                      <MembersSettings workspace={workspace} />
                    ) : (
                      <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground text-sm">
                          Workspace not found
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'billing' && (
                  <div className="h-full">
                    <BillingSettings />
                  </div>
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
              </CalendarSettingsWrapper>
            </div>
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
