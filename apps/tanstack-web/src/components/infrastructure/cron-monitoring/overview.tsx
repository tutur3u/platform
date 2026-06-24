'use client';

import {
  Activity,
  CalendarClock,
  Clock,
  Power,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { CronMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Switch } from '@tuturuuu/ui/switch';
import { useMemo } from 'react';
import {
  formatClockTime,
  formatCompactNumber,
  formatRelativeTime,
} from './formatters';
import type { CronMonitoringTranslations } from './status';

function MetricCard({
  icon,
  label,
  meta,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
    </div>
  );
}

export function CronMonitoringOverview({
  onEnabledChange,
  snapshot,
  t,
  updatingControl,
}: {
  onEnabledChange: (enabled: boolean) => void;
  snapshot: CronMonitoringSnapshot;
  t: CronMonitoringTranslations;
  updatingControl: boolean;
}) {
  const statCards = useMemo(
    () => [
      {
        icon: <Power className="h-4 w-4" />,
        label: t('cron.stats.runner'),
        meta: t('cron.stats.runner_meta'),
        value:
          snapshot.status === 'live'
            ? t('cron.runner_status.live')
            : snapshot.status === 'missing'
              ? t('cron.runner_status.missing')
              : t('cron.runner_status.stale'),
      },
      {
        icon: <CalendarClock className="h-4 w-4" />,
        label: t('cron.stats.next_run'),
        meta: formatClockTime(snapshot.nextRunAt),
        value: formatRelativeTime(snapshot.nextRunAt),
      },
      {
        icon: <Activity className="h-4 w-4" />,
        label: t('cron.stats.executions'),
        meta: t('cron.stats.retained_meta'),
        value: formatCompactNumber(snapshot.overview.retainedExecutions),
      },
      {
        icon: <Clock className="h-4 w-4" />,
        label: t('cron.stats.active_runs'),
        meta: t('cron.stats.active_runs_meta', {
          processing: snapshot.overview.processingRuns,
          queued: snapshot.overview.queuedRuns,
        }),
        value: formatCompactNumber(
          snapshot.overview.queuedRuns + snapshot.overview.processingRuns
        ),
      },
      {
        icon: <TriangleAlert className="h-4 w-4" />,
        label: t('cron.stats.failed_jobs'),
        meta: t('cron.stats.failed_jobs_meta'),
        value: formatCompactNumber(snapshot.overview.failedJobs),
      },
    ],
    [snapshot, t]
  );

  return (
    <section className="grid grid-flow-dense gap-4 lg:grid-cols-4">
      <div className="rounded-lg border border-border/60 bg-background p-5 lg:col-span-2">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-semibold text-xl tracking-tight">
              {t('cron.title')}
            </h2>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('cron.description')}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <Switch
              checked={snapshot.enabled}
              disabled={updatingControl}
              onCheckedChange={onEnabledChange}
            />
            <div>
              <p className="font-medium text-sm">
                {snapshot.enabled
                  ? t('cron.states.enabled')
                  : t('cron.states.disabled')}
              </p>
              <p className="text-muted-foreground text-xs">
                {snapshot.enabled
                  ? t('cron.control.enabled_hint')
                  : t('cron.control.disabled_hint')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {statCards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </section>
  );
}
