'use client';

import {
  Activity,
  Clock,
  Cpu,
  Gauge,
  GitBranch,
  HardDrive,
  Network,
  Radio,
  SquareStack,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  DockerInventoryPanel,
  RuntimeTopologyPanel,
  WatcherCadencePanel,
} from './blue-green-monitoring-panels';
import { useBlueGreenMonitoringSnapshot } from './blue-green-monitoring-query-hooks';
import {
  BlueGreenMonitoringAlerts,
  BlueGreenMonitoringErrorState,
  BlueGreenMonitoringLoadingState,
} from './blue-green-monitoring-state';
import {
  formatBytes,
  formatClockTime,
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
  getColorTranslationKey,
  getRuntimeStateTranslationKey,
} from './formatters';

export function BlueGreenMonitoringOverviewClient() {
  const t = useTranslations('blue-green-monitoring');
  const query = useBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 6,
    watcherLogLimit: 6,
  });

  if (query.isPending) {
    return <BlueGreenMonitoringLoadingState />;
  }

  if (query.error || !query.data) {
    return (
      <BlueGreenMonitoringErrorState onRetry={() => query.refetch()} t={t} />
    );
  }

  const snapshot = query.data;
  const runtimeStateKey = getRuntimeStateTranslationKey(snapshot.runtime.state);
  const activeColorKey = getColorTranslationKey(snapshot.runtime.activeColor);
  const statCards = [
    {
      icon: <Radio className="h-4 w-4" />,
      label: t('stats.active_color'),
      meta: t(runtimeStateKey),
      value: activeColorKey
        ? t(activeColorKey)
        : (snapshot.runtime.activeColor ?? t('states.none')),
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: t('stats.current_rpm'),
      meta: t('stats.requests_per_minute'),
      value: formatCompactNumber(
        snapshot.overview.currentAverageRequestsPerMinute ?? 0
      ),
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('stats.total_requests'),
      meta: t('stats.served_requests'),
      value: formatCompactNumber(snapshot.overview.totalRequestsServed),
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: t('stats.avg_build'),
      meta: t('stats.mean_rollout'),
      value: formatDuration(snapshot.overview.averageBuildDurationMs),
    },
    {
      icon: <Cpu className="h-4 w-4" />,
      label: t('stats.cpu'),
      meta: t('stats.total_container_cpu'),
      value: `${snapshot.dockerResources.totalCpuPercent.toFixed(1)}%`,
    },
    {
      icon: <HardDrive className="h-4 w-4" />,
      label: t('stats.memory'),
      meta: t('stats.total_container_memory'),
      value: formatBytes(snapshot.dockerResources.totalMemoryBytes),
    },
    {
      icon: <SquareStack className="h-4 w-4" />,
      label: t('stats.running_containers'),
      meta: t('stats.all_running_containers'),
      value: formatCompactNumber(snapshot.dockerResources.allContainers.length),
    },
    {
      icon: <Network className="h-4 w-4" />,
      label: t('stats.running_containers'),
      meta: t('stats.all_running_containers'),
      value: formatCompactNumber(snapshot.dockerResources.allContainers.length),
    },
    {
      icon: <Network className="h-4 w-4" />,
      label: t('stats.persisted_logs'),
      meta: t('stats.log_retention'),
      value: formatCompactNumber(snapshot.analytics.totalPersistedLogs),
    },
    {
      icon: <GitBranch className="h-4 w-4" />,
      label: t('stats.watcher'),
      meta: formatRelativeTime(snapshot.watcher.updatedAt),
      value: t(`watcher_health.${snapshot.watcher.health}`),
    },
  ];
  const focusCards = [
    {
      description: t('overview.focus_rollouts_description'),
      href: 'rollouts',
      title: t('routes.rollouts.title'),
      value: `${snapshot.overview.successfulDeployments}/${snapshot.overview.totalDeployments}`,
    },
    {
      description: t('overview.focus_requests_description'),
      href: 'requests',
      title: t('routes.requests.title'),
      value: formatCompactNumber(snapshot.analytics.totalPersistedLogs),
    },
    {
      description: t('overview.focus_logs_description'),
      href: 'watcher-logs',
      title: t('routes.logs.title'),
      value: formatCompactNumber(snapshot.watcher.logs.length),
    },
  ];

  return (
    <div className="space-y-6">
      <BlueGreenMonitoringAlerts snapshot={snapshot} t={t} />

      <div className="grid gap-4 md:grid-cols-3">
        {statCards.map((card) => (
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

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('overview.kicker')}
            </p>
            <h2 className="mt-1 font-semibold text-xl">
              {t('overview.title')}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              {t('overview.description')}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {focusCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-[1.5rem] border border-border/60 bg-background/70 p-4 transition-colors hover:border-dynamic-blue/30 hover:bg-background/85"
              >
                <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  {card.title}
                </p>
                <div className="mt-3 font-semibold text-2xl">{card.value}</div>
                <p className="mt-2 text-muted-foreground text-sm leading-6">
                  {card.description}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                {t('overview.kicker')}
              </p>
              <h2 className="mt-1 font-semibold text-xl">
                {t('overview.snapshot_title')}
              </h2>
            </div>
            <Badge variant="outline" className="rounded-full">
              {t(`watcher_health.${snapshot.watcher.health}`)}
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            <SnapshotRow
              label={t('hero.branch')}
              value={snapshot.watcher.target?.branch ?? t('states.none')}
            />
            <SnapshotRow
              label={t('hero.commit')}
              value={
                snapshot.watcher.latestCommit?.shortHash ?? t('states.none')
              }
            />
            <SnapshotRow
              label={t('hero.last_snapshot')}
              value={formatClockTime(snapshot.watcher.updatedAt)}
              meta={formatRelativeTime(snapshot.watcher.updatedAt)}
            />
            <SnapshotRow
              label={t('stats.current_rpm')}
              value={formatCompactNumber(
                snapshot.overview.currentAverageRequestsPerMinute ?? 0
              )}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <RuntimeTopologyPanel snapshot={snapshot} />
        <WatcherCadencePanel watcher={snapshot.watcher} />
      </div>

      <DockerInventoryPanel dockerResources={snapshot.dockerResources} />

      <div className="grid gap-6 xl:grid-cols-2">
        <PreviewCard
          description={t('overview.requests_preview_description')}
          emptyLabel={t('empty.requests')}
          href="requests"
          kicker={t('panels.requests')}
          linkLabel={t('overview.open_requests')}
          title={t('panels.recent_requests')}
        >
          {snapshot.analytics.recentRequests.map((request) => (
            <div
              key={`${request.time}-${request.path}`}
              className="rounded-[1.35rem] border border-border/60 bg-background/75 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{request.path}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {request.method ?? 'REQ'} · {request.status ?? '—'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium text-sm">
                    {formatClockTime(request.time)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatRelativeTime(request.time)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </PreviewCard>

        <PreviewCard
          description={t('overview.logs_preview_description')}
          emptyLabel={t('empty.logs')}
          href="watcher-logs"
          kicker={t('panels.logs')}
          linkLabel={t('overview.open_logs')}
          title={t('panels.latest_logs')}
        >
          {snapshot.watcher.logs.map((log, index) => (
            <div
              key={`${log.time}-${index}`}
              className="rounded-[1.35rem] border border-border/60 bg-background/75 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium text-sm">
                    {log.message}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {log.level.toUpperCase()} ·{' '}
                    {log.commitShortHash ?? t('states.none')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium text-sm">
                    {formatClockTime(log.time)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatRelativeTime(log.time)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </PreviewCard>
      </div>
    </div>
  );
}

function SnapshotRow({
  label,
  meta,
  value,
}: {
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/60 bg-background/75 px-4 py-3">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-2 font-medium text-sm">{value}</p>
      {meta ? (
        <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
      ) : null}
    </div>
  );
}

function PreviewCard({
  children,
  description,
  emptyLabel,
  href,
  kicker,
  linkLabel,
  title,
}: {
  children: React.ReactNode[];
  description: string;
  emptyLabel: string;
  href: string;
  kicker: string;
  linkLabel: string;
  title: string;
}) {
  const hasChildren = children.length > 0;

  return (
    <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {kicker}
          </p>
          <h2 className="mt-1 font-semibold text-lg">{title}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            {description}
          </p>
        </div>
        <Link
          href={href}
          className="rounded-full border border-border/60 px-3 py-1.5 font-medium text-sm transition-colors hover:border-dynamic-blue/30 hover:text-dynamic-blue"
        >
          {linkLabel}
        </Link>
      </div>

      <div className="space-y-3">
        {hasChildren ? (
          children
        ) : (
          <div className="rounded-[1.5rem] border border-border/60 border-dashed bg-background/60 px-4 py-10 text-center text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}
