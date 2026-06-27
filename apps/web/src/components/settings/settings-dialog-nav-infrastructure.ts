import {
  Bell,
  Box,
  Brain,
  BriefcaseBusiness,
  Building,
  CalendarDays,
  ClipboardList,
  Clock,
  Compass,
  CreditCard,
  FileText,
  Keyboard,
  Laptop,
  LayoutGrid,
  Share2,
  Shield,
  Users,
} from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildInfrastructureSettingsNavGroups({
  availability,
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  if (
    !wsId ||
    !(
      availability.canAccessIntegrations ||
      availability.canAccessApiKeys ||
      availability.canAccessSecrets ||
      availability.canAccessMigrations ||
      availability.canAccessInfrastructure ||
      availability.canAccessInternalProjects ||
      availability.canAccessPlatformRoles ||
      availability.canAccessPlatformBilling ||
      availability.canAccessInquiries
    )
  ) {
    return [];
  }

  return [
    {
      label: t('workspace-settings-layout.infrastructure'),
      items: [
        ...(availability.canAccessIntegrations
          ? [
              {
                name: 'integrations',
                label: t('sidebar_tabs.integrations'),
                icon: Compass,
                keywords: ['Integrations', 'Discord', 'Connections'],
              },
            ]
          : []),
        ...(availability.canAccessApiKeys
          ? [
              {
                name: 'api_keys',
                label: t('workspace-settings-layout.api_keys'),
                icon: Keyboard,
                keywords: ['API Keys', 'SDK', 'Tokens', 'Developer'],
              },
            ]
          : []),
        ...(availability.canAccessSecrets
          ? [
              {
                name: 'secrets',
                label: t('workspace-settings-layout.secrets'),
                icon: Shield,
                keywords: ['Secrets', 'Environment', 'Credentials'],
              },
            ]
          : []),
        ...(availability.canAccessPlatformRoles
          ? [
              {
                name: 'platform_roles',
                label: t('workspace-settings-layout.platform_roles'),
                icon: Shield,
                keywords: ['Platform', 'Roles', 'Access'],
              },
            ]
          : []),
        ...(availability.canAccessPlatformBilling
          ? [
              {
                name: 'platform_billing',
                label: 'Platform Billing',
                icon: CreditCard,
                keywords: ['Platform', 'Billing', 'Subscription'],
              },
            ]
          : []),
        ...(availability.canAccessMigrations
          ? [
              {
                name: 'migrations',
                label: t('workspace-settings-layout.migrations'),
                icon: Share2,
                keywords: ['Migrations', 'Import', 'External data'],
              },
            ]
          : []),
        ...(availability.canAccessInquiries
          ? [
              {
                name: 'inquiries',
                label: t('sidebar_tabs.inquiries'),
                icon: ClipboardList,
                keywords: ['Inquiries', 'Support', 'Reports'],
              },
            ]
          : []),
        ...buildInfrastructureRouteItems({ availability, t }),
      ],
    },
  ];
}

function buildInfrastructureRouteItems({
  availability,
  t,
}: Pick<SettingsNavBuilderParams, 'availability' | 't'>) {
  const internalProjectItems = availability.canAccessInternalProjects
    ? [
        {
          name: 'internal_projects',
          label: t('infrastructure-tabs.internal_projects'),
          icon: BriefcaseBusiness,
          keywords: [
            'Infrastructure',
            'Internal Projects',
            'CMS',
            'External Projects',
          ],
        },
      ]
    : [];

  if (!availability.canAccessInfrastructure) return internalProjectItems;

  return [
    ...internalProjectItems,
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
    ...(availability.canAccessPlatformRoles
      ? [
          {
            name: 'infrastructure_entity_creation_limits',
            label: t('infrastructure-tabs.entity_creation_limits'),
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
    ...(availability.canAccessInfrastructureMobileDeployment
      ? [
          {
            name: 'infrastructure_mobile_deployment',
            label: t('infrastructure-tabs.mobile_deployment'),
            icon: Laptop,
            keywords: ['Infrastructure', 'Mobile', 'Deployment', 'Vault'],
          },
        ]
      : []),
    ...(availability.canAccessSecrets
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
    ...(availability.canAccessInfrastructureExternalApps
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
      name: 'infrastructure_rate_limit_appeals',
      label: t('infrastructure-tabs.rate_limit_appeals'),
      icon: Shield,
      keywords: ['Infrastructure', 'Rate Limit Appeals', 'Unblock'],
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
      label: t('infrastructure-tabs.managed_cron_whitelisted_domains'),
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
      keywords: ['Infrastructure', 'Monitoring', 'Deployments', 'Rollouts'],
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
      keywords: ['Infrastructure', 'Monitoring', 'Observability'],
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
      keywords: ['Infrastructure', 'Monitoring', 'Stress Tests'],
    },
    {
      name: 'infrastructure_monitoring_watcher_logs',
      label: t('infrastructure-tabs.monitoring_watcher_logs'),
      icon: FileText,
      keywords: ['Infrastructure', 'Monitoring', 'Watcher Logs'],
    },
    {
      name: 'infrastructure_ai_credits',
      label: t('infrastructure-tabs.ai_credits'),
      icon: CreditCard,
      keywords: ['Infrastructure', 'AI Credits'],
    },
    ...(availability.canAccessInfrastructureChangelog
      ? [
          {
            name: 'infrastructure_changelog',
            label: t('infrastructure-tabs.changelog'),
            icon: FileText,
            keywords: ['Infrastructure', 'Changelog'],
          },
        ]
      : []),
  ];
}
