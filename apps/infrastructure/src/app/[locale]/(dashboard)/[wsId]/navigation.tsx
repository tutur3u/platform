import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  Bot,
  Building2,
  Calendar,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Globe,
  History,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquare,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Zap,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

export interface InfrastructureNavigationCard {
  description: string;
  href: string;
  icon: ReactNode;
  title: string;
}

const iconClassName = 'h-4 w-4';
const cardIconClassName = 'h-5 w-5 text-primary';

function icon(Icon: typeof LayoutDashboard, className = iconClassName) {
  return <Icon className={className} />;
}

function href(wsId: string, path = '') {
  return `/${wsId}${path}`;
}

function getTopLevelNavigation({
  t,
  wsId,
}: {
  t: Translator;
  wsId: string;
}): (NavLink | null)[] {
  return [
    {
      href: href(wsId),
      icon: icon(LayoutDashboard),
      matchExact: true,
      title: t('infrastructure-tabs.overview'),
    },
    {
      href: href(wsId, '/monitoring'),
      icon: icon(Activity),
      title: t('infrastructure-tabs.monitoring'),
      children: [
        {
          href: href(wsId, '/monitoring'),
          icon: icon(LayoutDashboard),
          matchExact: true,
          title: t('infrastructure-tabs.monitoring_overview'),
        },
        {
          href: href(wsId, '/monitoring/analytics'),
          icon: icon(BarChart3),
          title: t('infrastructure-tabs.monitoring_analytics'),
        },
        {
          href: href(wsId, '/monitoring/observability'),
          icon: icon(Activity),
          title: t('infrastructure-tabs.monitoring_observability'),
        },
        {
          href: href(wsId, '/monitoring/resources'),
          icon: icon(Server),
          title: t('infrastructure-tabs.monitoring_resources'),
        },
        {
          href: href(wsId, '/monitoring/deployments'),
          icon: icon(Rocket),
          title: t('infrastructure-navigation.items.monitoring_deployments'),
        },
        {
          href: href(wsId, '/monitoring/rollouts'),
          icon: icon(GitBranch),
          title: t('infrastructure-tabs.monitoring_rollouts'),
        },
        {
          href: href(wsId, '/monitoring/requests'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.monitoring_requests'),
        },
        {
          href: href(wsId, '/monitoring/logs'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.monitoring_logs'),
        },
        {
          href: href(wsId, '/monitoring/cron'),
          icon: icon(Clock),
          title: t('infrastructure-tabs.monitoring_cron'),
        },
        {
          href: href(wsId, '/monitoring/projects'),
          icon: icon(Building2),
          title: t('infrastructure-tabs.monitoring_projects'),
        },
        {
          href: href(wsId, '/monitoring/stress-tests'),
          icon: icon(Cpu),
          title: t('infrastructure-tabs.monitoring_stress_tests'),
        },
        {
          href: href(wsId, '/monitoring/watcher-logs'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.monitoring_watcher_logs'),
        },
        {
          href: href(wsId, '/realtime'),
          icon: icon(Zap),
          title: t('infrastructure-tabs.realtime'),
        },
      ],
    },
    {
      href: href(wsId, '/ai-agents'),
      icon: icon(Blocks),
      title: t('infrastructure-navigation.groups.ai_operations.title'),
      children: [
        {
          href: href(wsId, '/ai-agents'),
          icon: icon(Bot),
          title: t('infrastructure-tabs.ai_agents'),
        },
        {
          href: href(wsId, '/ai-credits'),
          icon: icon(Zap),
          title: t('infrastructure-tabs.ai_credits'),
        },
        {
          href: href(wsId, '/ai/whitelist/emails'),
          icon: icon(Mail),
          title: t('infrastructure-tabs.ai_whitelisted_emails'),
        },
        {
          href: href(wsId, '/ai/whitelist/domains'),
          icon: icon(Globe),
          title: t('infrastructure-navigation.items.ai_whitelisted_domains'),
        },
      ],
    },
    {
      href: href(wsId, '/email-audit'),
      icon: icon(MessageSquare),
      title: t('infrastructure-navigation.groups.communications.title'),
      children: [
        {
          href: href(wsId, '/email-audit'),
          icon: icon(Mail),
          title: t('infrastructure-tabs.email_audit'),
        },
        {
          href: href(wsId, '/email-templates'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.email_templates'),
        },
        {
          href: href(wsId, '/post-email-queue'),
          icon: icon(Clock),
          title: t('infrastructure-tabs.post_email_queue'),
        },
        {
          href: href(wsId, '/email-blacklist'),
          icon: icon(ShieldCheck),
          title: t('infrastructure-tabs.email_blacklist'),
        },
        {
          href: href(wsId, '/push-notifications'),
          icon: icon(Bell),
          title: t('infrastructure-tabs.push_notifications'),
        },
      ],
    },
    {
      href: href(wsId, '/abuse-intelligence'),
      icon: icon(ShieldCheck),
      title: t('infrastructure-navigation.groups.security.title'),
      children: [
        {
          href: href(wsId, '/abuse-intelligence'),
          icon: icon(ShieldCheck),
          title: t('infrastructure-tabs.abuse_intelligence'),
        },
        {
          href: href(wsId, '/abuse-events'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.abuse_events'),
        },
        {
          href: href(wsId, '/blocked-ips'),
          icon: icon(Lock),
          title: t('infrastructure-tabs.blocked_ips'),
        },
        {
          href: href(wsId, '/rate-limits'),
          icon: icon(Clock),
          title: t('infrastructure-tabs.rate_limits'),
        },
        {
          href: href(wsId, '/rate-limit-appeals'),
          icon: icon(FileText),
          title: t('infrastructure-tabs.rate_limit_appeals'),
        },
        {
          href: href(wsId, '/auth-recovery'),
          icon: icon(Lock),
          title: t('infrastructure-tabs.auth_recovery'),
        },
        {
          href: href(wsId, '/otp-limits'),
          icon: icon(Lock),
          title: t('infrastructure-tabs.otp_limits'),
        },
      ],
    },
    {
      href: href(wsId, '/users'),
      icon: icon(Users),
      title: t('infrastructure-navigation.groups.platform_admin.title'),
      children: [
        {
          href: href(wsId, '/users'),
          icon: icon(Users),
          title: t('infrastructure-tabs.users'),
        },
        {
          href: href(wsId, '/workspaces'),
          icon: icon(Building2),
          title: t('infrastructure-tabs.workspaces'),
        },
        {
          href: href(wsId, '/entity-creation-limits'),
          icon: icon(Settings),
          title: t('infrastructure-tabs.entity_creation_limits'),
        },
        {
          href: href(wsId, '/timezones'),
          icon: icon(Globe),
          title: t('infrastructure-tabs.timezones'),
        },
        {
          href: href(wsId, '/translations'),
          icon: icon(Globe),
          title: t('infrastructure-tabs.translations'),
        },
        {
          aliases: [href(wsId, '/changelog/new'), href(wsId, '/changelog/*')],
          href: href(wsId, '/changelog'),
          icon: icon(History),
          title: t('infrastructure-tabs.changelog'),
        },
        {
          href: href(wsId, '/holidays'),
          icon: icon(Calendar),
          title: t('infrastructure-navigation.items.holidays'),
        },
      ],
    },
    {
      href: href(wsId, '/external-apps'),
      icon: icon(Database),
      title: t('infrastructure-tabs.operations'),
      children: [
        {
          aliases: [href(wsId, '/external-apps/approve')],
          href: href(wsId, '/external-apps'),
          icon: icon(ExternalLink),
          title: t('infrastructure-tabs.external_apps'),
        },
        {
          href: href(wsId, '/mobile-deployment'),
          icon: icon(Smartphone),
          title: t('infrastructure-tabs.mobile_deployment'),
        },
        {
          href: href(wsId, '/mobile-versions'),
          icon: icon(Smartphone),
          title: t('infrastructure-tabs.mobile_versions'),
        },
        {
          href: href(wsId, '/devboxes'),
          icon: icon(Server),
          title: t('infrastructure-tabs.devboxes'),
        },
        {
          href: href(wsId, '/migrations'),
          icon: icon(Database),
          title: t('workspace-settings-layout.migrations'),
        },
        {
          href: href(wsId, '/app-coordination'),
          icon: icon(Settings),
          title: t('infrastructure-tabs.app_coordination'),
        },
        {
          href: href(wsId, '/calendar-sync'),
          icon: icon(Calendar),
          title: t('infrastructure-navigation.items.calendar_sync'),
        },
        {
          href: href(wsId, '/cron/whitelist/domains'),
          icon: icon(Clock),
          title: t('infrastructure-tabs.managed_cron_whitelisted_domains'),
        },
        {
          href: href(wsId, '/github-bot'),
          icon: icon(Bot),
          title: t('infrastructure-tabs.github_bot'),
        },
      ],
    },
  ];
}

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  return getTopLevelNavigation({ t, wsId: personalOrWsId });
}

export async function getInfrastructureNavigationCards({
  wsId,
}: {
  wsId: string;
  personalOrWsId?: string;
  isPersonal?: boolean;
  isTuturuuuUser?: boolean;
}): Promise<InfrastructureNavigationCard[]> {
  const t = await getTranslations();

  return [
    {
      description: t('infrastructure-navigation.groups.monitoring.description'),
      href: href(wsId, '/monitoring'),
      icon: icon(Activity, cardIconClassName),
      title: t('infrastructure-tabs.monitoring'),
    },
    {
      description: t('infrastructure-navigation.groups.operations.description'),
      href: href(wsId, '/migrations'),
      icon: icon(Database, cardIconClassName),
      title: t('infrastructure-tabs.operations'),
    },
    {
      description: t(
        'infrastructure-navigation.groups.ai_operations.description'
      ),
      href: href(wsId, '/ai-agents'),
      icon: icon(Blocks, cardIconClassName),
      title: t('infrastructure-navigation.groups.ai_operations.title'),
    },
    {
      description: t(
        'infrastructure-navigation.groups.communications.description'
      ),
      href: href(wsId, '/email-audit'),
      icon: icon(Mail, cardIconClassName),
      title: t('infrastructure-navigation.groups.communications.title'),
    },
    {
      description: t(
        'infrastructure-navigation.groups.platform_admin.description'
      ),
      href: href(wsId, '/users'),
      icon: icon(Users, cardIconClassName),
      title: t('infrastructure-navigation.groups.platform_admin.title'),
    },
  ];
}
