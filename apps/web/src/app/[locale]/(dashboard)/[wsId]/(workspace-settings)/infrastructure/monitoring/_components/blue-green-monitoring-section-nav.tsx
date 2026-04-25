'use client';

import { Activity, ChartColumnStacked, Logs, Radio } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function BlueGreenMonitoringSectionNav({
  baseHref,
}: {
  baseHref: string;
}) {
  const pathname = usePathname();
  const t = useTranslations('blue-green-monitoring');

  const items = [
    {
      description: t('routes.overview.description'),
      href: baseHref,
      icon: Activity,
      title: t('routes.overview.title'),
    },
    {
      description: t('routes.rollouts.description'),
      href: `${baseHref}/rollouts`,
      icon: ChartColumnStacked,
      title: t('routes.rollouts.title'),
    },
    {
      description: t('routes.requests.description'),
      href: `${baseHref}/requests`,
      icon: Radio,
      title: t('routes.requests.title'),
    },
    {
      description: t('routes.logs.description'),
      href: `${baseHref}/watcher-logs`,
      icon: Logs,
      title: t('routes.logs.title'),
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === baseHref
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              isActive
                ? 'border-dynamic-blue/35 bg-dynamic-blue/5'
                : 'border-border/60 bg-muted/20 hover:border-dynamic-blue/25 hover:bg-background'
            )}
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
