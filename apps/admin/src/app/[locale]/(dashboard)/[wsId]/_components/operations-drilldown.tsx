import {
  Activity,
  Bell,
  Clock,
  Coins,
  GitBranch,
  ListChecks,
  Mail,
  Rocket,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Zap,
} from '@tuturuuu/icons';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface DrilldownLink {
  href: string;
  icon: ReactNode;
  titleKey: string;
}

interface DrilldownGroup {
  key: 'reliability' | 'fleet' | 'mobile' | 'security' | 'spend';
  links: DrilldownLink[];
}

const iconClassName = 'h-4 w-4';

/**
 * Operational drill-down targets. Every entry points at an existing
 * Infrastructure route (also registered in `navigation.tsx`); titles reuse the
 * sidebar's `infrastructure-tabs` keys so labels stay consistent.
 */
export function getOperationsDrilldownGroups(wsId: string): DrilldownGroup[] {
  const to = (path: string) => `/${wsId}${path}`;
  return [
    {
      key: 'reliability',
      links: [
        {
          href: to('/monitoring'),
          icon: <Activity className={iconClassName} />,
          titleKey: 'infrastructure-tabs.monitoring',
        },
        {
          href: to('/monitoring/observability'),
          icon: <Activity className={iconClassName} />,
          titleKey: 'infrastructure-tabs.monitoring_observability',
        },
        {
          href: to('/monitoring/rollouts'),
          icon: <GitBranch className={iconClassName} />,
          titleKey: 'infrastructure-tabs.monitoring_rollouts',
        },
        {
          href: to('/monitoring/cron'),
          icon: <Clock className={iconClassName} />,
          titleKey: 'infrastructure-tabs.monitoring_cron',
        },
        {
          href: to('/realtime'),
          icon: <Zap className={iconClassName} />,
          titleKey: 'infrastructure-tabs.realtime',
        },
      ],
    },
    {
      key: 'fleet',
      links: [
        {
          href: to('/fleet'),
          icon: <Server className={iconClassName} />,
          titleKey: 'infrastructure-tabs.fleet',
        },
        {
          href: to('/fleet/jobs'),
          icon: <ListChecks className={iconClassName} />,
          titleKey: 'infrastructure-tabs.fleet_runs',
        },
      ],
    },
    {
      key: 'mobile',
      links: [
        {
          href: to('/mobile-versions'),
          icon: <Smartphone className={iconClassName} />,
          titleKey: 'infrastructure-tabs.mobile_versions',
        },
        {
          href: to('/mobile-deployment'),
          icon: <Rocket className={iconClassName} />,
          titleKey: 'infrastructure-tabs.mobile_deployment',
        },
        {
          href: to('/push-notifications'),
          icon: <Bell className={iconClassName} />,
          titleKey: 'infrastructure-tabs.push_notifications',
        },
      ],
    },
    {
      key: 'security',
      links: [
        {
          href: to('/abuse-intelligence'),
          icon: <ShieldAlert className={iconClassName} />,
          titleKey: 'infrastructure-tabs.abuse_intelligence',
        },
        {
          href: to('/rate-limits'),
          icon: <ShieldCheck className={iconClassName} />,
          titleKey: 'infrastructure-tabs.rate_limits',
        },
        {
          href: to('/blocked-ips'),
          icon: <ShieldCheck className={iconClassName} />,
          titleKey: 'infrastructure-tabs.blocked_ips',
        },
      ],
    },
    {
      key: 'spend',
      links: [
        {
          href: to('/ai-credits'),
          icon: <Coins className={iconClassName} />,
          titleKey: 'infrastructure-tabs.ai_credits',
        },
        {
          href: to('/email-audit'),
          icon: <Mail className={iconClassName} />,
          titleKey: 'infrastructure-tabs.email_audit',
        },
      ],
    },
  ];
}

export default async function OperationsDrilldown({ wsId }: { wsId: string }) {
  const t = await getTranslations();
  const groups = getOperationsDrilldownGroups(wsId);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {groups.map((group) => (
        <section
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          key={group.key}
        >
          <div>
            <h3 className="font-semibold text-sm">
              {t(
                `infrastructure-analytics.operations.groups.${group.key}.title`
              )}
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t(
                `infrastructure-analytics.operations.groups.${group.key}.description`
              )}
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-primary"
                  href={link.href}
                >
                  <span className="text-muted-foreground">{link.icon}</span>
                  {t(link.titleKey)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
