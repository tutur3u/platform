'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Clock,
  Cpu,
  Gauge,
  GitBranch,
  HardDrive,
  Network,
  Radio,
  TriangleAlert,
} from '@tuturuuu/icons';
import { getBlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  ContainerResourceChart,
  DeploymentStoryChart,
  PeriodTrendChart,
  RequestVelocityChart,
} from './blue-green-monitoring-charts';
import {
  DeploymentLedger,
  EventStreamPanel,
  RecentRequestsPanel,
  RolloutStagePanel,
  RuntimeTopologyPanel,
  TrafficPeriodsPanel,
  WatcherCadencePanel,
  WatcherLogsPanel,
} from './blue-green-monitoring-panels';
import {
  formatBytes,
  formatCompactNumber,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  getColorTranslationKey,
  getRuntimeStateTranslationKey,
} from './formatters';

export function BlueGreenMonitoringClient() {
  const t = useTranslations('blue-green-monitoring');
  const query = useQuery({
    queryKey: ['infrastructure', 'monitoring', 'blue-green'],
    queryFn: () => getBlueGreenMonitoringSnapshot(),
    refetchInterval: (query) =>
      query.state.data?.watcher.health === 'live' ? 5000 : 15000,
    staleTime: 2000,
  });

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted/60" />
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[2rem] bg-muted/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert variant="destructive" className="rounded-[2rem]">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>{t('alerts.failed_title')}</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>{t('alerts.failed_description')}</p>
          <Button onClick={() => query.refetch()} variant="outline">
            {t('actions.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const snapshot = query.data;
  const activeColorKey = getColorTranslationKey(snapshot.runtime.activeColor);
  const runtimeStateKey = getRuntimeStateTranslationKey(snapshot.runtime.state);
  const statCards = [
    {
      icon: <Radio className="h-4 w-4" />,
      label: t('stats.active_color'),
      value: activeColorKey
        ? t(activeColorKey)
        : (snapshot.runtime.activeColor ?? t('states.none')),
      meta: t(runtimeStateKey),
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: t('stats.current_rpm'),
      value: formatNumber(snapshot.overview.currentAverageRequestsPerMinute),
      meta: t('stats.requests_per_minute'),
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('stats.total_requests'),
      value: formatCompactNumber(snapshot.overview.totalRequestsServed),
      meta: t('stats.served_requests'),
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: t('stats.avg_build'),
      value: formatDuration(snapshot.overview.averageBuildDurationMs),
      meta: t('stats.mean_rollout'),
    },
    {
      icon: <Cpu className="h-4 w-4" />,
      label: t('stats.cpu'),
      value: `${snapshot.dockerResources.totalCpuPercent.toFixed(1)}%`,
      meta: t('stats.total_container_cpu'),
    },
    {
      icon: <HardDrive className="h-4 w-4" />,
      label: t('stats.memory'),
      value: formatBytes(snapshot.dockerResources.totalMemoryBytes),
      meta: t('stats.total_container_memory'),
    },
    {
      icon: <Network className="h-4 w-4" />,
      label: t('stats.persisted_logs'),
      value: formatCompactNumber(snapshot.analytics.totalPersistedLogs),
      meta: t('stats.log_retention'),
    },
    {
      icon: <GitBranch className="h-4 w-4" />,
      label: t('stats.watcher'),
      value: t(`watcher_health.${snapshot.watcher.health}`),
      meta: formatRelativeTime(snapshot.watcher.updatedAt),
    },
  ];

  return (
    <div className="space-y-6">
      {!snapshot.source.monitoringDirAvailable ? (
        <Alert className="rounded-[2rem] border-dynamic-orange/30 bg-dynamic-orange/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.mount_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.mount_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.source.monitoringDirAvailable &&
      !snapshot.source.statusAvailable ? (
        <Alert className="rounded-[2rem] border-dynamic-blue/20 bg-dynamic-blue/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.snapshot_missing_title')}</AlertTitle>
          <AlertDescription>
            {t('alerts.snapshot_missing_description')}
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.watcher.health !== 'live' ? (
        <Alert className="rounded-[2rem] border-dynamic-blue/20 bg-dynamic-blue/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('alerts.watcher_degraded_title')}</AlertTitle>
          <AlertDescription>
            {t(`alerts.watcher_degraded_${snapshot.watcher.health}`)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.84))] p-6 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(24,144,255,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_36%),linear-gradient(135deg,rgba(10,14,24,0.94),rgba(15,23,42,0.88))]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {t(runtimeStateKey)}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {t(`watcher_health.${snapshot.watcher.health}`)}
              </Badge>
              {snapshot.runtime.activeColor ? (
                <Badge variant="outline" className="rounded-full">
                  {t('hero.active_route', {
                    color: activeColorKey
                      ? t(activeColorKey)
                      : snapshot.runtime.activeColor,
                  })}
                </Badge>
              ) : null}
            </div>
            <div>
              <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">
                {t('hero.title')}
              </h2>
              <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
                {t('hero.description')}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('hero.branch')}
                </p>
                <p className="mt-1 font-medium">
                  {snapshot.watcher.target?.branch ?? t('states.none')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('hero.commit')}
                </p>
                <p className="mt-1 font-medium">
                  {snapshot.watcher.latestCommit?.shortHash ?? t('states.none')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('hero.last_snapshot')}
                </p>
                <p className="mt-1 font-medium">
                  {formatRelativeTime(snapshot.watcher.updatedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
            {statCards.slice(0, 4).map((card) => (
              <div
                key={card.label}
                className="rounded-[1.6rem] border border-border/60 bg-background/70 p-4 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  {card.icon}
                  <span>{card.label}</span>
                </div>
                <div className="mt-3 font-semibold text-2xl">{card.value}</div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {card.meta}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.slice(4).map((card) => (
          <div
            key={card.label}
            className="rounded-[1.75rem] border border-border/60 bg-background/80 p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
              {card.icon}
              <span>{card.label}</span>
            </div>
            <div className="mt-3 font-semibold text-2xl">{card.value}</div>
            <div className="mt-1 text-muted-foreground text-xs">
              {card.meta}
            </div>
          </div>
        ))}
      </div>

      <RolloutStagePanel
        deployments={snapshot.deployments}
        watcher={snapshot.watcher}
      />

      <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <TrafficPeriodsPanel analytics={snapshot.analytics} />
        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.traffic')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.request_velocity')}
            </h3>
          </div>
          <PeriodTrendChart metrics={snapshot.analytics.trends.daily} />
        </section>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.deployments')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.rollout_story')}
            </h3>
          </div>
          <DeploymentStoryChart deployments={snapshot.deployments} />
        </section>

        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.deployments')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.deploy_request_velocity')}
            </h3>
          </div>
          <RequestVelocityChart deployments={snapshot.deployments} />
        </section>
      </div>

      <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
        <div className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.containers')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('chart.container_pressure')}
          </h3>
        </div>
        <ContainerResourceChart dockerResources={snapshot.dockerResources} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <RuntimeTopologyPanel snapshot={snapshot} />
          <WatcherCadencePanel watcher={snapshot.watcher} />
        </div>
        <EventStreamPanel watcher={snapshot.watcher} />
      </div>

      <WatcherLogsPanel
        deployments={snapshot.deployments}
        logs={snapshot.watcher.logs}
      />

      <RecentRequestsPanel requests={snapshot.analytics.recentRequests} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.deployments')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">{t('ledger.title')}</h3>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {snapshot.overview.successfulDeployments} /{' '}
            {snapshot.overview.totalDeployments}
          </Badge>
        </div>
        <DeploymentLedger deployments={snapshot.deployments} />
      </section>
    </div>
  );
}
