'use client';

import {
  Activity,
  Clock,
  Gauge,
  GitBranch,
  HardDrive,
  Network,
  Radio,
  SquareStack,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import {
  formatClockTime,
  formatCompactNumber,
  formatDateTime,
  formatDecimalNumber,
  formatDuration,
  formatLatencyMs,
  formatNumber,
  formatRelativeTime,
  getColorTranslationKey,
  getDeploymentStatusTranslationKey,
  getRuntimeBadgeTranslationKey,
  getRuntimeStateTranslationKey,
} from './formatters';

export function RuntimeTopologyPanel({
  snapshot,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
}) {
  const t = useTranslations('blue-green-monitoring');
  const activeColorKey = getColorTranslationKey(snapshot.runtime.activeColor);
  const standbyColorKey = getColorTranslationKey(snapshot.runtime.standbyColor);
  const runtimeStateKey = getRuntimeStateTranslationKey(snapshot.runtime.state);
  const rows = [
    {
      icon: <Radio className="h-4 w-4" />,
      label: t('runtime.active_color'),
      value: activeColorKey
        ? t(activeColorKey)
        : (snapshot.runtime.activeColor ?? t('states.none')),
    },
    {
      icon: <SquareStack className="h-4 w-4" />,
      label: t('runtime.standby_color'),
      value: standbyColorKey
        ? t(standbyColorKey)
        : (snapshot.runtime.standbyColor ?? t('states.none')),
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('runtime.live_colors'),
      value:
        snapshot.runtime.liveColors.length > 0
          ? snapshot.runtime.liveColors
              .map((color) => {
                const colorKey = getColorTranslationKey(color);
                return colorKey ? t(colorKey) : color;
              })
              .join(' / ')
          : t('states.none'),
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: t('runtime.runtime_state'),
      value: t(runtimeStateKey),
    },
    {
      icon: <HardDrive className="h-4 w-4" />,
      label: t('runtime.deployment_stamp'),
      value: snapshot.runtime.deploymentStamp ?? '—',
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: t('runtime.activated_at'),
      value: formatDateTime(snapshot.runtime.activatedAt),
    },
  ];

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.runtime')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">{t('panels.topology')}</h3>
        </div>
        <StatusBadge label={t(runtimeStateKey)} />
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-background/80 px-3 py-2.5"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              {row.icon}
              <span>{row.label}</span>
            </div>
            <span className="max-w-[55%] truncate text-right font-medium text-sm">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatcherCadencePanel({
  watcher,
}: {
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const lastResultStatus =
    typeof watcher.lastResult?.status === 'string'
      ? watcher.lastResult.status
      : t('states.none');

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.watcher')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">{t('panels.cadence')}</h3>
        </div>
        <StatusBadge label={t(`watcher_health.${watcher.health}`)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricBlock
          icon={<GitBranch className="h-4 w-4" />}
          label={t('watcher.branch')}
          value={watcher.target?.branch ?? watcher.lock?.branch ?? '—'}
        />
        <MetricBlock
          icon={<Network className="h-4 w-4" />}
          label={t('watcher.upstream')}
          value={
            watcher.target?.upstreamRef ?? watcher.lock?.upstreamRef ?? '—'
          }
        />
        <MetricBlock
          icon={<Clock className="h-4 w-4" />}
          label={t('watcher.last_check')}
          value={formatRelativeTime(watcher.lastCheckAt)}
          meta={formatClockTime(watcher.lastCheckAt)}
        />
        <MetricBlock
          icon={<Clock className="h-4 w-4" />}
          label={t('watcher.next_check')}
          value={formatRelativeTime(watcher.nextCheckAt)}
          meta={formatClockTime(watcher.nextCheckAt)}
        />
        <MetricBlock
          icon={<Activity className="h-4 w-4" />}
          label={t('watcher.interval')}
          value={formatDuration(watcher.intervalMs)}
        />
        <MetricBlock
          icon={<Gauge className="h-4 w-4" />}
          label={t('watcher.last_result')}
          value={lastResultStatus}
        />
      </div>

      {watcher.args.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-background/80 p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            {t('watcher.args')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {watcher.args.map((arg) => (
              <Badge key={arg} variant="outline" className="rounded-full">
                {arg}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EventStreamPanel({
  watcher,
}: {
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.events')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('panels.signal_feed')}
          </h3>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {watcher.events.length}
        </Badge>
      </div>

      {watcher.events.length === 0 ? (
        <div className="rounded-2xl border border-border/60 border-dashed bg-background/60 p-6 text-center text-muted-foreground text-sm">
          {t('empty.events')}
        </div>
      ) : (
        <ScrollArea className="h-[360px] pr-3">
          <div className="space-y-3">
            {watcher.events.map((event, index) => (
              <div
                key={`${event.time}-${index}`}
                className="rounded-2xl border border-border/50 bg-background/80 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {event.level === 'error' ? (
                      <TriangleAlert className="h-4 w-4 text-dynamic-red" />
                    ) : event.level === 'warn' ? (
                      <TriangleAlert className="h-4 w-4 text-dynamic-orange" />
                    ) : (
                      <Radio className="h-4 w-4 text-dynamic-blue" />
                    )}
                    <span className="font-medium text-sm">{event.message}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {formatClockTime(event.time)}
                  </span>
                </div>
                <p className="mt-2 text-muted-foreground text-xs">
                  {formatRelativeTime(event.time)}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function TrafficPeriodsPanel({
  analytics,
}: {
  analytics: BlueGreenMonitoringSnapshot['analytics'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const periods = [
    ['daily', analytics.current.daily],
    ['weekly', analytics.current.weekly],
    ['monthly', analytics.current.monthly],
    ['yearly', analytics.current.yearly],
  ] as const;

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.traffic')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('panels.time_windows')}
          </h3>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {formatCompactNumber(analytics.totalPersistedLogs)}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {periods.map(([periodKey, metric]) => (
          <div
            key={periodKey}
            className="rounded-[1.7rem] border border-border/60 bg-background/85 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">
                  {t(`periods.${periodKey}`)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {metric?.bucketLabel ?? '—'}
                </p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {formatDecimalNumber((metric?.errorRate ?? 0) * 100, {
                  maximumFractionDigits: 1,
                })}
                %
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricBlock
                icon={<Activity className="h-4 w-4" />}
                label={t('stats.total_requests')}
                value={formatCompactNumber(metric?.requestCount ?? 0)}
              />
              <MetricBlock
                icon={<Gauge className="h-4 w-4" />}
                label={t('chart.peak_rpm')}
                value={formatNumber(metric?.peakRequestsPerMinute ?? 0)}
              />
              <MetricBlock
                icon={<Clock className="h-4 w-4" />}
                label={t('stats.avg_latency')}
                value={formatLatencyMs(metric?.averageLatencyMs)}
              />
              <MetricBlock
                icon={<GitBranch className="h-4 w-4" />}
                label={t('stats.deployments_touched')}
                value={formatNumber(metric?.deploymentCount ?? 0)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RolloutStagePanel({
  deployments,
  watcher,
}: {
  deployments: BlueGreenMonitoringSnapshot['deployments'];
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const latestDeployment = deployments[0] ?? null;
  const watcherStatus =
    typeof watcher.lastDeployStatus === 'string' && watcher.lastDeployStatus
      ? watcher.lastDeployStatus
      : null;
  const status =
    latestDeployment?.status ??
    (watcherStatus === 'up-to-date' ? 'successful' : watcherStatus) ??
    'unknown';
  const statusKey = getDeploymentStatusTranslationKey(status);
  const colorKey = getColorTranslationKey(latestDeployment?.activeColor);
  const startedAt =
    latestDeployment?.startedAt ??
    latestDeployment?.finishedAt ??
    watcher.lastDeployAt;
  const phaseDuration =
    status === 'building' || status === 'deploying'
      ? startedAt != null
        ? formatDuration(Math.max(0, Date.now() - startedAt))
        : '—'
      : formatDuration(latestDeployment?.buildDurationMs);
  const requestMeta =
    latestDeployment?.status === 'successful'
      ? t('stats.served_requests')
      : t('rollout.in_progress_meta');
  const failureDetail =
    typeof watcher.lastResult?.error === 'string'
      ? (watcher.lastResult.error.split('\n')[0]?.trim() ?? null)
      : null;
  const accentClass =
    status === 'failed'
      ? 'border-dynamic-red/25 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,241,242,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.22),transparent_32%),linear-gradient(135deg,rgba(20,10,13,0.96),rgba(39,13,19,0.92))]'
      : status === 'building'
        ? 'border-dynamic-orange/25 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,251,235,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.24),transparent_32%),linear-gradient(135deg,rgba(21,14,6,0.96),rgba(39,25,8,0.92))]'
        : status === 'deploying'
          ? 'border-dynamic-blue/25 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.24),transparent_32%),linear-gradient(135deg,rgba(8,14,27,0.96),rgba(12,24,44,0.92))]'
          : 'border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,253,250,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_32%),linear-gradient(135deg,rgba(8,18,16,0.96),rgba(11,27,23,0.92))]';

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border p-5 shadow-sm backdrop-blur-sm ${accentClass}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              {t('panels.rollout_now')}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {t(statusKey)}
            </Badge>
            {latestDeployment?.deploymentKind ? (
              <Badge variant="outline" className="rounded-full">
                {latestDeployment.deploymentKind}
              </Badge>
            ) : null}
          </div>

          <div>
            <h3 className="font-semibold text-2xl tracking-tight md:text-3xl">
              {latestDeployment?.commitSubject ?? t('rollout.idle_title')}
            </h3>
            <p className="mt-2 text-muted-foreground text-sm md:text-base">
              {t('rollout.description')}
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                {t('rollout.commit')}
              </p>
              <p className="mt-1 font-medium">
                {latestDeployment?.commitShortHash ?? t('states.none')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                {t('rollout.route')}
              </p>
              <p className="mt-1 font-medium">
                {colorKey
                  ? t(colorKey)
                  : (latestDeployment?.activeColor ?? t('states.none'))}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                {t('rollout.last_change')}
              </p>
              <p className="mt-1 font-medium">
                {formatRelativeTime(startedAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
          <MetricBlock
            icon={<Clock className="h-4 w-4" />}
            label={t('rollout.phase_time')}
            value={phaseDuration}
            meta={formatClockTime(startedAt)}
          />
          <MetricBlock
            icon={<SquareStack className="h-4 w-4" />}
            label={t('rollout.requests')}
            value={formatCompactNumber(latestDeployment?.requestCount)}
            meta={requestMeta}
          />
          <MetricBlock
            icon={<Gauge className="h-4 w-4" />}
            label={t('rollout.avg_latency')}
            value={formatLatencyMs(latestDeployment?.averageLatencyMs)}
            meta={t('stats.avg_latency')}
          />
          <MetricBlock
            icon={<Activity className="h-4 w-4" />}
            label={t('rollout.last_result')}
            value={watcherStatus ? t(statusKey) : '—'}
            meta={formatRelativeTime(watcher.lastDeployAt)}
          />
        </div>
      </div>

      {failureDetail ? (
        <Alert className="mt-5 rounded-[1.6rem] border-dynamic-red/25 bg-dynamic-red/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('rollout.failure_title')}</AlertTitle>
          <AlertDescription>{failureDetail}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

export function RecentRequestsPanel({
  requests,
}: {
  requests: BlueGreenMonitoringSnapshot['analytics']['recentRequests'];
}) {
  const t = useTranslations('blue-green-monitoring');

  return (
    <div className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.requests')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('panels.recent_requests')}
          </h3>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {requests.length}
        </Badge>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-border/60 border-dashed bg-background/60 p-6 text-center text-muted-foreground text-sm">
          {t('empty.requests')}
        </div>
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-3">
            {requests.map((request) => {
              const deploymentLabel =
                request.deploymentStamp ??
                request.deploymentColor ??
                t('states.none');
              const status = request.status ?? 0;

              return (
                <div
                  key={`${request.time}-${request.path}-${request.status}-${request.deploymentKey ?? 'none'}`}
                  className="rounded-2xl border border-border/50 bg-background/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={status >= 400 ? 'destructive' : 'outline'}
                          className="rounded-full"
                        >
                          {request.method ?? 'REQ'}
                        </Badge>
                        <span className="truncate font-medium text-sm">
                          {request.path}
                        </span>
                        {request.isInternal ? (
                          <Badge variant="secondary" className="rounded-full">
                            {t('requests.internal')}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground text-xs">
                        <span>{deploymentLabel}</span>
                        <span>{formatClockTime(request.time)}</span>
                        <span>{formatLatencyMs(request.requestTimeMs)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">
                        {request.status ?? '—'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatRelativeTime(request.time)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function WatcherLogsPanel({
  deployments,
  logs,
}: {
  deployments: BlueGreenMonitoringSnapshot['deployments'];
  logs: BlueGreenMonitoringSnapshot['watcher']['logs'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const [selectedScope, setSelectedScope] = useState('all');
  const deferredScope = useDeferredValue(selectedScope);
  const scopeOptions = [
    {
      key: 'all',
      label: t('logs.scope_all'),
    },
    ...deployments
      .map((deployment) => {
        const deploymentKey =
          deployment.deploymentStamp != null
            ? `stamp:${deployment.deploymentStamp}`
            : deployment.commitHash != null
              ? `commit:${deployment.commitHash}`
              : null;

        if (!deploymentKey) {
          return null;
        }

        return {
          key: deploymentKey,
          label:
            deployment.commitShortHash ??
            deployment.deploymentStamp ??
            deployment.activeColor ??
            t('states.none'),
        };
      })
      .filter(
        (value, index, values): value is { key: string; label: string } =>
          value != null &&
          values.findIndex((candidate) => candidate?.key === value.key) ===
            index
      ),
  ];
  const scopeKeys = new Set(scopeOptions.map((option) => option.key));
  const effectiveScope = scopeKeys.has(deferredScope) ? deferredScope : 'all';
  const filteredLogs =
    effectiveScope === 'all'
      ? logs
      : logs.filter((log) => log.deploymentKey === effectiveScope);

  return (
    <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.logs')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('panels.latest_logs')}
          </h3>
          <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
            {t('logs.description')}
          </p>
        </div>
        <Badge variant="secondary" className="rounded-full">
          {filteredLogs.length} {t('logs.entries')}
        </Badge>
      </div>

      <ScrollArea className="pb-4">
        <div className="flex gap-2">
          {scopeOptions.map((option) => (
            <Button
              key={option.key}
              className="rounded-full"
              onClick={() => setSelectedScope(option.key)}
              size="sm"
              variant={effectiveScope === option.key ? 'default' : 'outline'}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </ScrollArea>

      {filteredLogs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border/60 border-dashed bg-background/60 p-6 text-center text-muted-foreground text-sm">
          {effectiveScope === 'all' ? t('empty.logs') : t('empty.logs_scoped')}
        </div>
      ) : (
        <ScrollArea className="mt-4 h-[420px] pr-3">
          <div className="space-y-3">
            {filteredLogs.map((log, index) => {
              const deploymentLabel =
                log.commitShortHash ??
                log.deploymentStamp ??
                log.activeColor ??
                t('states.none');
              const levelVariant =
                log.level === 'error'
                  ? 'destructive'
                  : log.level === 'warn'
                    ? 'secondary'
                    : 'outline';

              return (
                <div
                  key={`${log.time}-${log.message}-${index}`}
                  className="rounded-2xl border border-border/50 bg-background/85 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={levelVariant} className="rounded-full">
                          {log.level.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="rounded-full">
                          {deploymentLabel}
                        </Badge>
                        {log.deploymentStatus ? (
                          <Badge variant="outline" className="rounded-full">
                            {t(
                              getDeploymentStatusTranslationKey(
                                log.deploymentStatus
                              )
                            )}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap font-mono text-sm leading-6">
                        {log.message}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">
                        {formatClockTime(log.time)}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {formatRelativeTime(log.time)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}

export function DeploymentLedger({
  deployments,
}: {
  deployments: BlueGreenMonitoringSnapshot['deployments'];
}) {
  const t = useTranslations('blue-green-monitoring');

  if (deployments.length === 0) {
    return (
      <div className="rounded-[2rem] border border-border/60 border-dashed bg-background/50 p-8 text-center text-muted-foreground text-sm">
        {t('empty.ledger')}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {deployments.map((deployment, index) =>
        (() => {
          const deploymentStatusKey = getDeploymentStatusTranslationKey(
            deployment.status
          );
          const runtimeBadgeKey = getRuntimeBadgeTranslationKey(
            deployment.runtimeState
          );
          const activeColorKey = getColorTranslationKey(deployment.activeColor);

          return (
            <div
              key={`${deployment.commitHash ?? deployment.startedAt ?? index}`}
              className="rounded-[2rem] border border-border/60 bg-background/70 p-5 backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={t(deploymentStatusKey)} />
                    {runtimeBadgeKey ? (
                      <Badge variant="outline" className="rounded-full">
                        {t(runtimeBadgeKey)}
                      </Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-semibold text-lg">
                    {deployment.commitSubject ?? t('ledger.no_commit_subject')}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {deployment.commitShortHash ?? t('states.none')} ·{' '}
                    {activeColorKey
                      ? t(activeColorKey)
                      : (deployment.activeColor ?? t('states.none'))}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {deployment.deploymentStamp ?? t('states.none')}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">
                    {formatDateTime(
                      deployment.activatedAt ??
                        deployment.finishedAt ??
                        deployment.startedAt
                    )}
                  </div>
                  <div className="mt-1 font-medium">
                    {formatRelativeTime(
                      deployment.activatedAt ??
                        deployment.finishedAt ??
                        deployment.startedAt
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MetricBlock
                  icon={<Clock className="h-4 w-4" />}
                  label={t('ledger.build_time')}
                  value={formatDuration(deployment.buildDurationMs)}
                />
                <MetricBlock
                  icon={<Gauge className="h-4 w-4" />}
                  label={t('ledger.avg_rpm')}
                  value={formatDecimalNumber(
                    deployment.averageRequestsPerMinute,
                    {
                      maximumFractionDigits: 1,
                    }
                  )}
                />
                <MetricBlock
                  icon={<Activity className="h-4 w-4" />}
                  label={t('ledger.peak_rpm')}
                  value={formatNumber(deployment.peakRequestsPerMinute)}
                />
                <MetricBlock
                  icon={<SquareStack className="h-4 w-4" />}
                  label={t('ledger.requests')}
                  value={formatCompactNumber(deployment.requestCount)}
                />
                <MetricBlock
                  icon={<TriangleAlert className="h-4 w-4" />}
                  label={t('ledger.errors')}
                  value={formatCompactNumber(deployment.errorCount)}
                />
                <MetricBlock
                  icon={<Clock className="h-4 w-4" />}
                  label={t('stats.avg_latency')}
                  value={formatLatencyMs(deployment.averageLatencyMs)}
                />
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function MetricBlock({
  icon,
  label,
  meta,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-medium text-base">{value}</div>
      {meta ? (
        <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
      ) : null}
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="rounded-full border-border/70">
      {label}
    </Badge>
  );
}
