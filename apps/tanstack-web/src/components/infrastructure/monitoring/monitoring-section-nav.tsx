'use client';

import { useLocation, useSearch } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  Box,
  CalendarClock,
  DatabaseZap,
  Gauge,
  Logs,
  Radio,
  Zap,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/platform/next-link-shim';

function getSharedQuerySuffix(search: Record<string, unknown>) {
  const params = new URLSearchParams();

  for (const key of ['project', 'hours']) {
    const value = search[key];
    if (typeof value === 'string' && value) {
      params.set(key, value);
    }
  }

  return params.size > 0 ? `?${params.toString()}` : '';
}

export function MonitoringSectionNav({ baseHref }: { baseHref: string }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false });
  const t = useTranslations('blue-green-monitoring');
  const querySuffix = getSharedQuerySuffix(search as Record<string, unknown>);

  const items = [
    {
      description: t('routes.overview.description'),
      href: baseHref,
      icon: Activity,
      title: t('routes.overview.title'),
    },
    {
      description: t('routes.deployments.description'),
      href: `${baseHref}/deployments`,
      icon: Box,
      title: t('routes.deployments.title'),
    },
    {
      description: t('routes.logs.description'),
      href: `${baseHref}/logs`,
      icon: Logs,
      title: t('routes.logs.title'),
    },
    {
      description: t('routes.analytics.description'),
      href: `${baseHref}/analytics`,
      icon: BarChart3,
      title: t('routes.analytics.title'),
    },
    {
      description: t('routes.observability.description'),
      href: `${baseHref}/observability`,
      icon: DatabaseZap,
      title: t('routes.observability.title'),
    },
    {
      description: t('routes.cron.description'),
      href: `${baseHref}/cron`,
      icon: CalendarClock,
      title: t('routes.cron.title'),
    },
    {
      description: t('routes.requests.description'),
      href: `${baseHref}/requests`,
      icon: Radio,
      title: t('routes.requests.title'),
    },
    {
      description: t('routes.resources.description'),
      href: `${baseHref}/resources`,
      icon: Gauge,
      title: t('routes.resources.title'),
    },
    {
      description: t('routes.stress_tests.description'),
      href: `${baseHref}/stress-tests`,
      icon: Zap,
      title: t('routes.stress_tests.title'),
    },
  ];

  return (
    <div className="grid grid-flow-dense gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-9">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === baseHref
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isActive
                ? 'border-dynamic-blue/35 bg-dynamic-blue/5'
                : 'border-border/60 bg-muted/20 hover:border-dynamic-blue/25 hover:bg-background'
            )}
            href={`${item.href}${querySuffix}`}
            key={item.href}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'rounded-md border p-2',
                  isActive
                    ? 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue'
                    : 'border-border/60 bg-background text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="mt-1 text-muted-foreground text-xs leading-5">
                  {item.description}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
