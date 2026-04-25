'use client';

import {
  Activity,
  Clock,
  Gauge,
  GitBranch,
  SquareStack,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import type { BlueGreenMonitoringDeploymentRollup } from './blue-green-monitoring-deployments';
import {
  ExplorerPagination,
  FilterSelect,
  getSafePage,
  getTotalPages,
  PAGE_SIZE_OPTIONS,
  PaginationSummary,
  paginateItems,
} from './blue-green-monitoring-explorer-shared';
import {
  MetricBlock,
  StatusBadge,
} from './blue-green-monitoring-panel-primitives';
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
} from './formatters';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
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
    <div className="rounded-lg border border-border/60 bg-muted/20 p-5">
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
            className="rounded-lg border border-border/60 bg-background/85 p-4"
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
  deployments: BlueGreenMonitoringDeploymentRollup[];
  watcher: BlueGreenMonitoringSnapshot['watcher'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const now = useNow();
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
        ? formatDuration(Math.max(0, now - startedAt))
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
      ? 'border-dynamic-red/25 bg-dynamic-red/5'
      : status === 'building'
        ? 'border-dynamic-orange/25 bg-dynamic-orange/5'
        : status === 'deploying'
          ? 'border-dynamic-blue/25 bg-dynamic-blue/5'
          : 'border-border/60 bg-background';

  return (
    <section className={`overflow-hidden rounded-lg border p-5 ${accentClass}`}>
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
            meta={formatClockTime(startedAt)}
            value={phaseDuration}
          />
          <MetricBlock
            icon={<SquareStack className="h-4 w-4" />}
            label={t('rollout.requests')}
            meta={requestMeta}
            value={formatCompactNumber(latestDeployment?.requestCount)}
          />
          <MetricBlock
            icon={<Gauge className="h-4 w-4" />}
            label={t('rollout.avg_latency')}
            meta={t('stats.avg_latency')}
            value={formatLatencyMs(latestDeployment?.averageLatencyMs)}
          />
          <MetricBlock
            icon={<Activity className="h-4 w-4" />}
            label={t('rollout.last_result')}
            meta={formatRelativeTime(watcher.lastDeployAt)}
            value={watcherStatus ? t(statusKey) : '—'}
          />
        </div>
      </div>

      {failureDetail ? (
        <Alert className="mt-5 rounded-lg border-dynamic-red/25 bg-dynamic-red/5">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>{t('rollout.failure_title')}</AlertTitle>
          <AlertDescription>{failureDetail}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

export function DeploymentLedger({
  deployments,
}: {
  deployments: BlueGreenMonitoringDeploymentRollup[];
}) {
  const t = useTranslations('blue-green-monitoring');
  const [page, setPage] = useQueryState(
    'deploymentsPage',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [pageSize, setPageSize] = useQueryState(
    'deploymentsPageSize',
    parseAsInteger.withDefault(10).withOptions({ shallow: true })
  );
  const normalizedPageSize = PAGE_SIZE_OPTIONS.includes(
    String(pageSize) as (typeof PAGE_SIZE_OPTIONS)[number]
  )
    ? pageSize
    : 10;

  if (deployments.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 border-dashed bg-muted/20 p-8 text-center text-muted-foreground text-sm">
        {t('empty.ledger')}
      </div>
    );
  }

  const safePage = getSafePage(page, deployments.length, normalizedPageSize);
  const visibleDeployments = paginateItems(
    deployments,
    safePage,
    normalizedPageSize
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
          <PaginationSummary
            currentPage={safePage}
            filteredCount={deployments.length}
            pageSize={normalizedPageSize}
            t={t}
            totalCount={deployments.length}
          />
          <FilterSelect
            label={t('explorer.page_size')}
            onValueChange={(value) => {
              void setPage(1);
              void setPageSize(Number(value));
            }}
            options={PAGE_SIZE_OPTIONS.map((option) => ({
              label: t('explorer.per_page', { count: Number(option) }),
              value: option,
            }))}
            value={String(normalizedPageSize)}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleDeployments.map((deployment, index) => {
          const deploymentStatusKey = getDeploymentStatusTranslationKey(
            deployment.status
          );
          const runtimeBadgeKey = getRuntimeBadgeTranslationKey(
            deployment.runtimeState
          );
          const activeColors =
            deployment.activeColors.length > 0
              ? deployment.activeColors
              : deployment.activeColor
                ? [deployment.activeColor]
                : [];
          const activeColorLabel =
            activeColors.length > 0
              ? activeColors
                  .map((color) => {
                    const colorKey = getColorTranslationKey(color);
                    return colorKey ? t(colorKey) : color;
                  })
                  .join(' / ')
              : t('states.none');

          return (
            <div
              key={`${deployment.commitHash ?? deployment.startedAt ?? index}`}
              className="rounded-lg border border-border/60 bg-muted/20 p-5"
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
                    {deployment.mergedDeploymentCount > 1 ? (
                      <Badge variant="secondary" className="rounded-full">
                        {deployment.mergedDeploymentCount}
                      </Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-semibold text-lg">
                    {deployment.commitSubject ?? t('ledger.no_commit_subject')}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {deployment.commitShortHash ?? t('states.none')} ·{' '}
                    {activeColorLabel}
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
        })}
      </div>

      <ExplorerPagination
        currentPage={safePage}
        onNextPage={() => {
          void setPage(safePage + 1);
        }}
        onPreviousPage={() => {
          void setPage(safePage - 1);
        }}
        t={t}
        totalItems={deployments.length}
        totalPages={getTotalPages(deployments.length, normalizedPageSize)}
      />
    </div>
  );
}
