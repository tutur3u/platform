'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Bookmark,
  Box,
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
  KanbanSquare,
  Keyboard,
  Laptop,
  LayoutGrid,
  Paintbrush,
  Share2,
  Shield,
  Sparkles,
  Star,
  Tags,
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
import type { CalendarConnection, Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { apiFetch } from '@/lib/api-fetch';
import {
  AccountManagementSettings,
  AppearanceSettings,
  ApprovalsSettings,
  AttendanceDisplaySettings,
  BoardSettingsPanel,
  CalendarContentSettingsPanel,
  CalendarGeneralSettingsPanel,
  CalendarIntegrationsSettingsPanel,
  DatabaseDefaultFiltersSettings,
  DebtLoanSettings,
  DefaultCurrencySettings,
  ExperimentalFinanceSettings,
  FeaturedGroupsSettings,
  FinanceNavigationSettings,
  FormsAutosaveSettings,
  InvoiceSettings,
  InvoiceVisibilitySettings,
  KeyboardShortcutsSettings,
  MiraMemorySettings,
  MiraPersonalitySettings,
  NavigationSidebarSettings,
  NotificationSettings,
  ProfileSettingsPanel,
  preloadBoardSettingsPanel,
  ReferralSettings,
  ReportDefaultTitleSettings,
  RequireAttentionColorSettings,
  SecuritySettings,
  SessionSettings,
  SettingsRouteEntryPanel,
  TaskGeneralSettingsPanel,
  TaskInitiativesSettings,
  TaskLabelsSettings,
  TaskProjectsSettings,
  TaskShareSettings,
  TaskTemplatesSettings,
  TimeTrackerCategoriesSettings,
  TimeTrackerGeneralSettings,
  TimeTrackerGoalsSettings,
  TimeTrackerRequestsSettings,
  TransactionDefaultsSettings,
  UserStatusSettings,
  UsersManagementSettings,
  WorkspaceBillingSettings,
  WorkspaceBreakTypesSettings,
  WorkspaceGeneralSettingsPanel,
  WorkspaceMembersSettingsPanel,
} from './settings-dialog-lazy-panels';

interface SettingsDialogProps {
  boardId?: string;
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
  workspace?: Workspace | null;
  linkedProvider?: string;
}

const BOARD_SETTINGS_PRELOAD_EVENT = 'tuturuuu:board-settings-intent';

type SettingsAvailabilityKey =
  | 'api_keys'
  | 'billing'
  | 'infrastructure'
  | 'infrastructure_changelog'
  | 'infrastructure_external_apps'
  | 'infrastructure_mobile_deployment'
  | 'inquiries'
  | 'integrations'
  | 'migrations'
  | 'platform_billing'
  | 'platform_roles'
  | 'reports'
  | 'secrets'
  | 'usage'
  | 'workspace_members'
  | 'workspace_roles'
  | 'workspace_settings';

type WorkspaceSettingsPermissions = {
  allow_discord_integrations?: boolean;
  available?: Partial<Record<SettingsAvailabilityKey, boolean>>;
  can_access_billing?: boolean;
  enable_api_keys?: boolean;
  is_root_workspace?: boolean;
  manage_api_keys?: boolean;
  manage_subscription: boolean;
  manage_user_report_templates?: boolean;
  manage_workspace_billing?: boolean;
  manage_workspace_integrations?: boolean;
  manage_workspace_members: boolean;
  manage_workspace_roles?: boolean;
  manage_workspace_secrets?: boolean;
  manage_workspace_settings: boolean;
  view_infrastructure?: boolean;
  view_usage?: boolean;
};

function normalizeSettingsTab(tab: string) {
  return tab === 'sidebar' ? 'navigation' : tab;
}

export function SettingsDialog({
  boardId,
  wsId,
  user,
  defaultTab = 'profile',
  workspace: workspaceProp,
  linkedProvider,
}: SettingsDialogProps) {
  const t = useTranslations();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      BOARD_SETTINGS_PRELOAD_EVENT,
      preloadBoardSettingsPanel
    );

    return () => {
      window.removeEventListener(
        BOARD_SETTINGS_PRELOAD_EVENT,
        preloadBoardSettingsPanel
      );
    };
  }, []);
  const normalizedDefaultTab = normalizeSettingsTab(defaultTab);
  const [activeTab, setActiveTab] = useState(normalizedDefaultTab);
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
        apiFetch<WorkspaceSettingsPermissions>(
          `/api/v1/workspaces/${wsId}/settings/permissions`,
          {
            cache: 'no-store',
          }
        ),
      enabled: !!wsId,
      staleTime: 5 * 60 * 1000,
    });

  const hasBillingPermission =
    workspacePermissions?.available?.billing ??
    workspacePermissions?.can_access_billing ??
    workspacePermissions?.manage_subscription ??
    false;
  const canManageWorkspaceSettings =
    workspacePermissions?.manage_workspace_settings ?? false;
  const canManageWorkspaceMembers =
    workspacePermissions?.manage_workspace_members ?? false;
  const isSettingsEntryAvailable = (
    key: SettingsAvailabilityKey,
    fallback = false
  ) => workspacePermissions?.available?.[key] ?? fallback;
  const canAccessReports = isSettingsEntryAvailable(
    'reports',
    workspacePermissions?.manage_user_report_templates ?? false
  );
  const canAccessUsage = isSettingsEntryAvailable(
    'usage',
    workspacePermissions?.view_usage ?? false
  );
  const canAccessIntegrations = isSettingsEntryAvailable(
    'integrations',
    workspacePermissions?.manage_workspace_integrations ??
      workspacePermissions?.allow_discord_integrations ??
      false
  );
  const canAccessApiKeys = isSettingsEntryAvailable(
    'api_keys',
    Boolean(
      workspacePermissions?.enable_api_keys &&
        workspacePermissions?.manage_api_keys
    )
  );
  const canAccessSecrets = isSettingsEntryAvailable(
    'secrets',
    workspacePermissions?.manage_workspace_secrets ?? false
  );
  const canAccessMigrations = isSettingsEntryAvailable('migrations');
  const canAccessInfrastructure = isSettingsEntryAvailable(
    'infrastructure',
    workspacePermissions?.view_infrastructure ?? false
  );
  const canAccessPlatformRoles = isSettingsEntryAvailable('platform_roles');
  const canAccessPlatformBilling = isSettingsEntryAvailable('platform_billing');
  const canAccessInquiries = isSettingsEntryAvailable('inquiries');
  const canAccessInfrastructureExternalApps = isSettingsEntryAvailable(
    'infrastructure_external_apps'
  );
  const canAccessInfrastructureMobileDeployment = isSettingsEntryAvailable(
    'infrastructure_mobile_deployment'
  );
  const canAccessInfrastructureChangelog = isSettingsEntryAvailable(
    'infrastructure_changelog'
  );
  const canManageVersionBadge = isExactTuturuuuDotComEmail(user?.email);
  const isRootWorkspace = workspace?.id === ROOT_WORKSPACE_ID;
  const routePanelHrefs: Record<string, string> = wsId
    ? {
        api_keys: `/${wsId}/api-keys`,
        infrastructure_abuse_events: `/${wsId}/infrastructure/abuse-events`,
        infrastructure_abuse_intelligence: `/${wsId}/infrastructure/abuse-intelligence`,
        infrastructure_ai_agents: `/${wsId}/infrastructure/ai-agents`,
        infrastructure_ai_credits: `/${wsId}/infrastructure/ai-credits`,
        infrastructure_ai_whitelisted_domains: `/${wsId}/infrastructure/ai/whitelist/domains`,
        infrastructure_ai_whitelisted_emails: `/${wsId}/infrastructure/ai/whitelist/emails`,
        infrastructure_app_coordination: `/${wsId}/infrastructure/app-coordination`,
        infrastructure_blocked_ips: `/${wsId}/infrastructure/blocked-ips`,
        infrastructure_calendar_sync: `/${wsId}/infrastructure/calendar-sync`,
        infrastructure_changelog: `/${wsId}/infrastructure/changelog`,
        infrastructure_cron_whitelisted_domains: `/${wsId}/infrastructure/cron/whitelist/domains`,
        infrastructure_devboxes: `/${wsId}/infrastructure/devboxes`,
        infrastructure_email_audit: `/${wsId}/infrastructure/email-audit`,
        infrastructure_email_blacklist: `/${wsId}/infrastructure/email-blacklist`,
        infrastructure_email_templates: `/${wsId}/infrastructure/email-templates`,
        infrastructure_entity_creation_limits: `/${wsId}/infrastructure/entity-creation-limits`,
        infrastructure_external_apps: `/${wsId}/infrastructure/external-apps`,
        infrastructure_github_bot: `/${wsId}/infrastructure/github-bot`,
        infrastructure_mobile_deployment: `/${wsId}/infrastructure/mobile-deployment`,
        infrastructure_mobile_versions: `/${wsId}/infrastructure/mobile-versions`,
        infrastructure_monitoring: `/${wsId}/infrastructure/monitoring`,
        infrastructure_monitoring_analytics: `/${wsId}/infrastructure/monitoring/analytics`,
        infrastructure_monitoring_cron: `/${wsId}/infrastructure/monitoring/cron`,
        infrastructure_monitoring_logs: `/${wsId}/infrastructure/monitoring/logs`,
        infrastructure_monitoring_observability: `/${wsId}/infrastructure/monitoring/observability`,
        infrastructure_monitoring_projects: `/${wsId}/infrastructure/monitoring/projects`,
        infrastructure_monitoring_requests: `/${wsId}/infrastructure/monitoring/requests`,
        infrastructure_monitoring_resources: `/${wsId}/infrastructure/monitoring/resources`,
        infrastructure_monitoring_rollouts: `/${wsId}/infrastructure/monitoring/deployments`,
        infrastructure_monitoring_stress_tests: `/${wsId}/infrastructure/monitoring/stress-tests`,
        infrastructure_monitoring_watcher_logs: `/${wsId}/infrastructure/monitoring/watcher-logs`,
        infrastructure_otp_limits: `/${wsId}/infrastructure/otp-limits`,
        infrastructure_overview: `/${wsId}/infrastructure`,
        infrastructure_post_email_queue: `/${wsId}/infrastructure/post-email-queue`,
        infrastructure_push_notifications: `/${wsId}/infrastructure/push-notifications`,
        infrastructure_rate_limits: `/${wsId}/infrastructure/rate-limits`,
        infrastructure_realtime: `/${wsId}/infrastructure/realtime`,
        infrastructure_timezones: `/${wsId}/infrastructure/timezones`,
        infrastructure_translations: `/${wsId}/infrastructure/translations`,
        infrastructure_users: `/${wsId}/infrastructure/users`,
        infrastructure_workspaces: `/${wsId}/infrastructure/workspaces`,
        inquiries: `/${wsId}/inquiries`,
        integrations: `/${wsId}/integrations`,
        migrations: `/${wsId}/migrations`,
        platform_billing: `/${wsId}/platform/billing`,
        platform_roles: `/${wsId}/platform/roles`,
        secrets: `/${wsId}/secrets`,
        usage: `/${wsId}/usage`,
        workspace_reports: `/${wsId}/settings/reports`,
      }
    : {};
  const allowWorkspaceBasicsEdit =
    !isRootWorkspace &&
    (Boolean(workspace?.personal) || canManageWorkspaceSettings);
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
    setActiveTab(normalizedDefaultTab);
  }, [normalizedDefaultTab]);

  // Reset activeTab if billing permission is revoked or not available
  useEffect(() => {
    if (
      !isBillingPermissionLoading &&
      hasBillingPermission === false &&
      activeTab === 'workspace_billing'
    ) {
      const safeFallback =
        normalizedDefaultTab === 'workspace_billing'
          ? 'profile'
          : normalizedDefaultTab;
      setActiveTab(safeFallback);
    }
  }, [
    hasBillingPermission,
    isBillingPermissionLoading,
    activeTab,
    normalizedDefaultTab,
  ]);

  // Fetch calendar connections when workspace is available (using TanStack Query)
  const { data: calendarConnections } = useQuery({
    queryKey: ['calendar-connections', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const payload = await apiFetch<{
        connections?: CalendarConnection[];
      }>(`/api/v1/calendar/connections?wsId=${workspace.id}`, {
        cache: 'no-store',
      });

      return payload.connections ?? [];
    },
    enabled: !!workspace?.id && activeTab === 'calendar_integrations',
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
          name: 'navigation',
          label: t('settings.preferences.navigation.menu_label'),
          icon: Compass,
          description: t('settings.preferences.navigation.menu_description'),
          keywords: [
            'Navigation',
            'Sidebar',
            'Start page',
            'Workspace',
            'Redirect',
            'Menu',
          ],
        },
        {
          name: 'forms',
          label: t('settings.preferences.forms'),
          icon: FileText,
          description: t('settings.preferences.forms_description'),
          keywords: ['Forms', 'Auto-save', 'Form builder'],
        },
        {
          name: 'keyboard_shortcuts',
          label: t('settings.preferences.keyboard_shortcuts'),
          icon: Keyboard,
          description: t('settings.preferences.keyboard_shortcuts_description'),
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
        },
      ],
    },
    {
      label: t('settings.tasks.title'),
      items: [
        ...(wsId && boardId
          ? [
              {
                name: 'task_board',
                label: t('settings.tasks.board'),
                icon: KanbanSquare,
                description: t('settings.tasks.board_description'),
                keywords: ['Tasks', 'Board', 'Layout', 'Estimates', 'Logs'],
              },
            ]
          : []),
        {
          name: 'tasks_general',
          label: t('settings.tasks.general'),
          icon: CheckSquare,
          description: t('settings.tasks.general_description'),
          keywords: ['Tasks', 'General', 'Review', 'Due date'],
        },
        {
          name: 'task_share',
          label: t('settings.tasks.share'),
          icon: Share2,
          description: t('settings.tasks.share_description'),
          keywords: ['Tasks', 'Share', 'Guests', 'Access'],
        },
        ...(wsId
          ? [
              {
                name: 'task_labels',
                label: t('settings.tasks.labels'),
                icon: Tags,
                description: t('settings.tasks.labels_description'),
                keywords: ['Tasks', 'Labels', 'Tags'],
              },
              {
                name: 'task_projects',
                label: t('settings.tasks.projects'),
                icon: Box,
                description: t('settings.tasks.projects_description'),
                keywords: ['Tasks', 'Projects'],
              },
              {
                name: 'task_initiatives',
                label: t('settings.tasks.initiatives'),
                icon: Goal,
                description: t('settings.tasks.initiatives_description'),
                keywords: ['Tasks', 'Initiatives'],
              },
              {
                name: 'task_templates',
                label: t('settings.tasks.templates'),
                icon: Bookmark,
                description: t('settings.tasks.templates_description'),
                keywords: ['Tasks', 'Templates'],
              },
            ]
          : []),
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
          ...(canAccessReports
            ? [
                {
                  label: t('settings.reports.title'),
                  items: [
                    {
                      name: 'workspace_reports',
                      label: t('workspace-settings-layout.reports'),
                      icon: FileText,
                      keywords: [
                        'Reports',
                        'Templates',
                        'Report settings',
                        'Lead generation',
                      ],
                    },
                    {
                      name: 'report_default_title',
                      label: t('settings.reports.default_title'),
                      icon: FileText,
                      description: t(
                        'settings.reports.default_title_description'
                      ),
                      keywords: ['Reports', 'Templates', 'Title', 'Default'],
                    },
                  ],
                },
              ]
            : []),
        ]
      : []),
    {
      label: t('settings.workspaces.title'),
      items: wsId
        ? [
            {
              name: 'workspace_general',
              label: t('settings.workspaces.general'),
              icon: Building,
              description: t('ws-settings.general-description'),
              keywords: ['Workspace', 'General'],
            },
            ...(canManageWorkspaceMembers
              ? [
                  {
                    name: 'workspace_members',
                    label: t('settings.workspaces.members'),
                    icon: Users,
                    description: t('ws-settings.members-description'),
                    keywords: ['Members', 'Team', 'Roles'],
                  },
                ]
              : []),
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
            ...(canAccessUsage
              ? [
                  {
                    name: 'usage',
                    label: t('sidebar_tabs.usage'),
                    icon: LayoutGrid,
                    keywords: ['Usage', 'Activity', 'Metrics', 'Quota'],
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
        : [],
    },
    ...(wsId &&
    (canAccessIntegrations ||
      canAccessApiKeys ||
      canAccessSecrets ||
      canAccessMigrations ||
      canAccessInfrastructure ||
      canAccessPlatformRoles ||
      canAccessPlatformBilling ||
      canAccessInquiries)
      ? [
          {
            label: t('workspace-settings-layout.infrastructure'),
            items: [
              ...(canAccessIntegrations
                ? [
                    {
                      name: 'integrations',
                      label: t('sidebar_tabs.integrations'),
                      icon: Compass,
                      keywords: ['Integrations', 'Discord', 'Connections'],
                    },
                  ]
                : []),
              ...(canAccessApiKeys
                ? [
                    {
                      name: 'api_keys',
                      label: t('workspace-settings-layout.api_keys'),
                      icon: Keyboard,
                      keywords: ['API Keys', 'SDK', 'Tokens', 'Developer'],
                    },
                  ]
                : []),
              ...(canAccessSecrets
                ? [
                    {
                      name: 'secrets',
                      label: t('workspace-settings-layout.secrets'),
                      icon: Shield,
                      keywords: ['Secrets', 'Environment', 'Credentials'],
                    },
                  ]
                : []),
              ...(canAccessPlatformRoles
                ? [
                    {
                      name: 'platform_roles',
                      label: t('workspace-settings-layout.platform_roles'),
                      icon: Shield,
                      keywords: ['Platform', 'Roles', 'Access'],
                    },
                  ]
                : []),
              ...(canAccessPlatformBilling
                ? [
                    {
                      name: 'platform_billing',
                      label: 'Platform Billing',
                      icon: CreditCard,
                      keywords: ['Platform', 'Billing', 'Subscription'],
                    },
                  ]
                : []),
              ...(canAccessMigrations
                ? [
                    {
                      name: 'migrations',
                      label: t('workspace-settings-layout.migrations'),
                      icon: Share2,
                      keywords: ['Migrations', 'Import', 'External data'],
                    },
                  ]
                : []),
              ...(canAccessInquiries
                ? [
                    {
                      name: 'inquiries',
                      label: t('sidebar_tabs.inquiries'),
                      icon: ClipboardList,
                      keywords: ['Inquiries', 'Support', 'Reports'],
                    },
                  ]
                : []),
              ...(canAccessInfrastructure
                ? [
                    {
                      name: 'infrastructure_overview',
                      label: t('infrastructure-tabs.overview'),
                      icon: Building,
                      keywords: ['Infrastructure', 'Overview'],
                    },
                    {
                      name: 'infrastructure_users',
                      label: t('infrastructure-tabs.users'),
                      icon: Users,
                      keywords: ['Infrastructure', 'Users'],
                    },
                    {
                      name: 'infrastructure_workspaces',
                      label: t('infrastructure-tabs.workspaces'),
                      icon: Building,
                      keywords: ['Infrastructure', 'Workspaces'],
                    },
                    ...(canAccessPlatformRoles
                      ? [
                          {
                            name: 'infrastructure_entity_creation_limits',
                            label: t(
                              'infrastructure-tabs.entity_creation_limits'
                            ),
                            icon: LayoutGrid,
                            keywords: ['Infrastructure', 'Limits'],
                          },
                          {
                            name: 'infrastructure_mobile_versions',
                            label: t('infrastructure-tabs.mobile_versions'),
                            icon: Laptop,
                            keywords: ['Infrastructure', 'Mobile', 'Versions'],
                          },
                        ]
                      : []),
                    ...(canAccessInfrastructureMobileDeployment
                      ? [
                          {
                            name: 'infrastructure_mobile_deployment',
                            label: t('infrastructure-tabs.mobile_deployment'),
                            icon: Laptop,
                            keywords: [
                              'Infrastructure',
                              'Mobile',
                              'Deployment',
                              'Vault',
                            ],
                          },
                        ]
                      : []),
                    ...(canAccessSecrets
                      ? [
                          {
                            name: 'infrastructure_github_bot',
                            label: t('infrastructure-tabs.github_bot'),
                            icon: Compass,
                            keywords: ['Infrastructure', 'GitHub', 'Bot'],
                          },
                          {
                            name: 'infrastructure_ai_agents',
                            label: t('infrastructure-tabs.ai_agents'),
                            icon: Brain,
                            keywords: ['Infrastructure', 'AI', 'Agents'],
                          },
                        ]
                      : []),
                    ...(canAccessInfrastructureExternalApps
                      ? [
                          {
                            name: 'infrastructure_external_apps',
                            label: t('infrastructure-tabs.external_apps'),
                            icon: Keyboard,
                            keywords: ['Infrastructure', 'External Apps'],
                          },
                          {
                            name: 'infrastructure_app_coordination',
                            label: t('infrastructure-tabs.app_coordination'),
                            icon: Share2,
                            keywords: ['Infrastructure', 'App Coordination'],
                          },
                        ]
                      : []),
                    {
                      name: 'infrastructure_email_blacklist',
                      label: t('infrastructure-tabs.email_blacklist'),
                      icon: Bell,
                      keywords: ['Infrastructure', 'Email', 'Blacklist'],
                    },
                    {
                      name: 'infrastructure_email_audit',
                      label: t('infrastructure-tabs.email_audit'),
                      icon: FileText,
                      keywords: ['Infrastructure', 'Email', 'Audit'],
                    },
                    {
                      name: 'infrastructure_email_templates',
                      label: t('infrastructure-tabs.email_templates'),
                      icon: FileText,
                      keywords: ['Infrastructure', 'Email', 'Templates'],
                    },
                    {
                      name: 'infrastructure_post_email_queue',
                      label: t('infrastructure-tabs.post_email_queue'),
                      icon: Bell,
                      keywords: ['Infrastructure', 'Email', 'Queue'],
                    },
                    {
                      name: 'infrastructure_push_notifications',
                      label: t('infrastructure-tabs.push_notifications'),
                      icon: Bell,
                      keywords: ['Infrastructure', 'Push Notifications'],
                    },
                    {
                      name: 'infrastructure_blocked_ips',
                      label: t('infrastructure-tabs.blocked_ips'),
                      icon: Shield,
                      keywords: ['Infrastructure', 'Blocked IPs', 'Security'],
                    },
                    {
                      name: 'infrastructure_abuse_events',
                      label: t('infrastructure-tabs.abuse_events'),
                      icon: Shield,
                      keywords: ['Infrastructure', 'Abuse Events'],
                    },
                    {
                      name: 'infrastructure_abuse_intelligence',
                      label: t('infrastructure-tabs.abuse_intelligence'),
                      icon: Shield,
                      keywords: ['Infrastructure', 'Abuse Intelligence'],
                    },
                    {
                      name: 'infrastructure_rate_limits',
                      label: t('infrastructure-tabs.rate_limits'),
                      icon: LayoutGrid,
                      keywords: ['Infrastructure', 'Rate Limits'],
                    },
                    {
                      name: 'infrastructure_otp_limits',
                      label: t('infrastructure-tabs.otp_limits'),
                      icon: Keyboard,
                      keywords: ['Infrastructure', 'OTP Limits'],
                    },
                    {
                      name: 'infrastructure_timezones',
                      label: t('infrastructure-tabs.timezones'),
                      icon: Clock,
                      keywords: ['Infrastructure', 'Timezones'],
                    },
                    {
                      name: 'infrastructure_ai_whitelisted_emails',
                      label: t('infrastructure-tabs.ai_whitelisted_emails'),
                      icon: Bell,
                      keywords: ['Infrastructure', 'AI', 'Whitelist', 'Email'],
                    },
                    {
                      name: 'infrastructure_ai_whitelisted_domains',
                      label: t('ws-ai-whitelist-domains.plural'),
                      icon: Building,
                      keywords: ['Infrastructure', 'AI', 'Whitelist', 'Domain'],
                    },
                    {
                      name: 'infrastructure_cron_whitelisted_domains',
                      label: t(
                        'infrastructure-tabs.managed_cron_whitelisted_domains'
                      ),
                      icon: Clock,
                      keywords: ['Infrastructure', 'Cron', 'Domains'],
                    },
                    {
                      name: 'infrastructure_translations',
                      label: t('infrastructure-tabs.translations'),
                      icon: FileText,
                      keywords: ['Infrastructure', 'Translations'],
                    },
                    {
                      name: 'infrastructure_calendar_sync',
                      label: 'Calendar Sync',
                      icon: CalendarDays,
                      keywords: ['Infrastructure', 'Calendar', 'Sync'],
                    },
                    {
                      name: 'infrastructure_realtime',
                      label: t('infrastructure-tabs.realtime'),
                      icon: Clock,
                      keywords: ['Infrastructure', 'Realtime'],
                    },
                    {
                      name: 'infrastructure_devboxes',
                      label: t('infrastructure-tabs.devboxes'),
                      icon: Box,
                      keywords: ['Infrastructure', 'Devboxes'],
                    },
                    {
                      name: 'infrastructure_monitoring',
                      label: t('infrastructure-tabs.monitoring'),
                      icon: LayoutGrid,
                      keywords: ['Infrastructure', 'Monitoring'],
                    },
                    {
                      name: 'infrastructure_monitoring_cron',
                      label: t('infrastructure-tabs.monitoring_cron'),
                      icon: Clock,
                      keywords: ['Infrastructure', 'Monitoring', 'Cron'],
                    },
                    {
                      name: 'infrastructure_monitoring_rollouts',
                      label: t('infrastructure-tabs.monitoring_rollouts'),
                      icon: Box,
                      keywords: [
                        'Infrastructure',
                        'Monitoring',
                        'Deployments',
                        'Rollouts',
                      ],
                    },
                    {
                      name: 'infrastructure_monitoring_logs',
                      label: t('infrastructure-tabs.monitoring_logs'),
                      icon: FileText,
                      keywords: ['Infrastructure', 'Monitoring', 'Logs'],
                    },
                    {
                      name: 'infrastructure_monitoring_analytics',
                      label: t('infrastructure-tabs.monitoring_analytics'),
                      icon: LayoutGrid,
                      keywords: ['Infrastructure', 'Monitoring', 'Analytics'],
                    },
                    {
                      name: 'infrastructure_monitoring_observability',
                      label: t('infrastructure-tabs.monitoring_observability'),
                      icon: Building,
                      keywords: [
                        'Infrastructure',
                        'Monitoring',
                        'Observability',
                      ],
                    },
                    {
                      name: 'infrastructure_monitoring_projects',
                      label: t('infrastructure-tabs.monitoring_projects'),
                      icon: Box,
                      keywords: ['Infrastructure', 'Monitoring', 'Projects'],
                    },
                    {
                      name: 'infrastructure_monitoring_requests',
                      label: t('infrastructure-tabs.monitoring_requests'),
                      icon: Clock,
                      keywords: ['Infrastructure', 'Monitoring', 'Requests'],
                    },
                    {
                      name: 'infrastructure_monitoring_resources',
                      label: t('infrastructure-tabs.monitoring_resources'),
                      icon: Building,
                      keywords: ['Infrastructure', 'Monitoring', 'Resources'],
                    },
                    {
                      name: 'infrastructure_monitoring_stress_tests',
                      label: t('infrastructure-tabs.monitoring_stress_tests'),
                      icon: Share2,
                      keywords: [
                        'Infrastructure',
                        'Monitoring',
                        'Stress Tests',
                      ],
                    },
                    {
                      name: 'infrastructure_monitoring_watcher_logs',
                      label: t('infrastructure-tabs.monitoring_watcher_logs'),
                      icon: FileText,
                      keywords: [
                        'Infrastructure',
                        'Monitoring',
                        'Watcher Logs',
                      ],
                    },
                    {
                      name: 'infrastructure_ai_credits',
                      label: t('infrastructure-tabs.ai_credits'),
                      icon: CreditCard,
                      keywords: ['Infrastructure', 'AI Credits'],
                    },
                    ...(canAccessInfrastructureChangelog
                      ? [
                          {
                            name: 'infrastructure_changelog',
                            label: t('infrastructure-tabs.changelog'),
                            icon: FileText,
                            keywords: ['Infrastructure', 'Changelog'],
                          },
                        ]
                      : []),
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(wsId
      ? [
          {
            label: t('settings.calendar.title'),
            items: [
              {
                name: 'calendar_general',
                label: t('settings.calendar.general'),
                icon: CalendarDays,
                description: t('settings.calendar.general_description'),
                keywords: ['Calendar', 'General', 'Lunar'],
              },
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
                name: 'calendar_integrations',
                label: t('settings.calendar.integrations'),
                icon: CalendarDays,
                description: t('settings.calendar.integrations_description'),
                keywords: ['Calendar', 'Integrations', 'Google', 'Outlook'],
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
                keywords: [
                  'Attendance',
                  'Display',
                  'Members',
                  'Managers',
                  'Totals',
                ],
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

  const activeTabIsVisible = navItems.some((group) =>
    group.items.some((item) => item.name === activeTab && !item.disabled)
  );
  const fallbackTab = navItems
    .flatMap((group) => group.items)
    .find((item) => !item.disabled)?.name;
  const activeRoutePanelHref = activeTabIsVisible
    ? routePanelHrefs[activeTab]
    : undefined;

  useEffect(() => {
    if (isBillingPermissionLoading || activeTabIsVisible) return;

    if (fallbackTab && fallbackTab !== activeTab) {
      setActiveTab(fallbackTab);
    }
  }, [activeTab, activeTabIsVisible, fallbackTab, isBillingPermissionLoading]);

  return (
    <SettingsDialogShell
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      {activeTab === 'profile' && user && <ProfileSettingsPanel user={user} />}

      {activeTab === 'security' && user && (
        <div className="h-full">
          <SecuritySettings
            user={user}
            linkedProvider={linkedProvider}
            onOpenSessions={() => setActiveTab('sessions')}
          />
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
          <AppearanceSettings canManageVersionBadge={canManageVersionBadge} />
        </div>
      )}

      {activeTab === 'navigation' && (
        <div className="h-full">
          <NavigationSidebarSettings wsId={wsId} user={user} />
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

      {activeTab === 'keyboard_shortcuts' && (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      )}

      {activeTab === 'tasks_general' && (
        <TaskGeneralSettingsPanel workspace={workspace} wsId={wsId} />
      )}

      {activeTab === 'task_board' && wsId && boardId && (
        <div className="h-full">
          <BoardSettingsPanel boardId={boardId} wsId={wsId} />
        </div>
      )}

      {activeTab === 'task_share' && (
        <div className="h-full">
          <TaskShareSettings boardId={boardId} wsId={wsId} />
        </div>
      )}

      {activeTab === 'task_labels' && wsId && (
        <div className="h-full">
          <TaskLabelsSettings wsId={wsId} />
        </div>
      )}

      {activeTab === 'task_projects' && wsId && (
        <div className="h-full">
          <TaskProjectsSettings wsId={wsId} />
        </div>
      )}

      {activeTab === 'task_initiatives' && wsId && (
        <div className="h-full">
          <TaskInitiativesSettings wsId={wsId} />
        </div>
      )}

      {activeTab === 'task_templates' && wsId && (
        <div className="h-full">
          <TaskTemplatesSettings wsId={wsId} />
        </div>
      )}

      {activeTab === 'mira_personality' && (
        <div className="h-full">
          <MiraPersonalitySettings />
        </div>
      )}

      {activeTab === 'mira_memories' && (
        <div className="h-full">
          <MiraMemorySettings wsId={wsId} />
        </div>
      )}

      {activeTab === 'workspace_general' && (
        <WorkspaceGeneralSettingsPanel
          allowWorkspaceBasicsEdit={allowWorkspaceBasicsEdit}
          isLoadingWorkspace={isLoadingWorkspace}
          user={user}
          workspace={workspace}
          workspaceError={workspaceError}
        />
      )}

      {activeTab === 'workspace_members' && (
        <WorkspaceMembersSettingsPanel
          canManageWorkspaceMembers={canManageWorkspaceMembers}
          isLoadingWorkspace={isLoadingWorkspace}
          workspace={workspace}
          workspaceError={workspaceError}
        />
      )}

      {activeTab === 'workspace_billing' && wsId && hasBillingPermission && (
        <div className="h-full">
          <WorkspaceBillingSettings wsId={wsId} />
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
        <TransactionDefaultsSettings workspaceId={workspace.id} user={user} />
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

      {activeTab === 'calendar_general' && (
        <CalendarGeneralSettingsPanel
          title={t('settings.calendar.general')}
          description={t('settings.calendar.general_description')}
          workspace={workspace}
          wsId={wsId}
        />
      )}

      {activeTab === 'calendar_integrations' && wsId && (
        <CalendarIntegrationsSettingsPanel
          wsId={wsId}
          title={t('settings.calendar.integrations')}
          description={t('settings.calendar.integrations_description')}
          workspace={workspace}
          calendarConnections={calendarConnections || []}
        />
      )}

      {(activeTab === 'calendar_hours' || activeTab === 'calendar_colors') &&
        wsId && (
          <CalendarContentSettingsPanel
            section={activeTab}
            wsId={wsId}
            workspace={workspace}
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

      {activeRoutePanelHref && (
        <SettingsRouteEntryPanel href={activeRoutePanelHref} />
      )}
    </SettingsDialogShell>
  );
}
