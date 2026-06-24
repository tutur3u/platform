'use client';

import { FileText } from '@tuturuuu/icons';
import type {
  ObservabilityAnalytics,
  ObservabilityLogEvent,
  ObservabilityOverview,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { cn } from '@tuturuuu/utils/format';
import {
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
  formatPercent,
  statusClass,
} from './formatters';
import { MetricCard, MiniBars, toneClasses } from './primitives';
import type { MonitoringTone, MonitoringTranslator } from './types';

function getStatusFamilyTone(label: string): MonitoringTone {
  if (label === 'serverError') return 'red';
  if (label === 'clientError') return 'orange';
  if (label === 'redirect') return 'blue';
  if (label === 'success') return 'green';
  return 'muted';
}

function getSourceTone(label: string): MonitoringTone {
  if (label === 'cron') return 'amber';
  if (label === 'api') return 'blue';
  if (label === 'server') return 'green';
  return 'muted';
}

function getStatusRows(
  analytics: ObservabilityAnalytics | undefined,
  t: MonitoringTranslator
) {
  return Object.entries(analytics?.statusFamilies ?? {}).map(
    ([label, value]) => ({
      label: t(`status_families.${label}`),
      tone: getStatusFamilyTone(label),
      value,
    })
  );
}

function getSourceRows(overview: ObservabilityOverview | undefined) {
  return Object.entries(overview?.sourceCounts ?? {}).map(([label, value]) => ({
    label: label.toUpperCase(),
    tone: getSourceTone(label),
    value,
  }));
}

function getRouteRows(overview: ObservabilityOverview | undefined) {
  return (overview?.topRoutes ?? []).map((route) => ({
    label: route.path,
    tone: route.errorCount > 0 ? ('red' as const) : ('blue' as const),
    value: route.requestCount,
  }));
}

function getCronRows(analytics: ObservabilityAnalytics | undefined) {
  return (analytics?.topCronJobs ?? []).map((job) => ({
    label: job.jobId,
    tone: job.failureCount > 0 ? ('red' as const) : ('green' as const),
    value: job.runCount,
  }));
}

export function ObservabilityMetricSummary({
  overview,
  t,
}: {
  overview: ObservabilityOverview | undefined;
  t: MonitoringTranslator;
}) {
  return (
    <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
      <MetricCard
        label={t('metrics.requests')}
        meta={t('metrics.requests_meta')}
        value={formatCompactNumber(overview?.requestCount)}
      />
      <MetricCard
        label={t('metrics.errors')}
        meta={formatPercent(overview?.errorRate)}
        value={formatCompactNumber(overview?.serverErrorCount)}
      />
      <MetricCard
        label={t('metrics.p95')}
        meta={t('metrics.p95_meta')}
        value={formatLatencyMs(overview?.p95DurationMs)}
      />
      <MetricCard
        label={t('signals.last_event')}
        meta={t('signals.last_event_meta')}
        value={formatDateTime(overview?.lastEventAt)}
      />
    </section>
  );
}

export function OverviewPanel({
  analytics,
  overview,
  t,
}: {
  analytics: ObservabilityAnalytics | undefined;
  overview: ObservabilityOverview | undefined;
  t: MonitoringTranslator;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getStatusRows(analytics, t)}
        title={t('charts.status_distribution')}
      />
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getRouteRows(overview)}
        title={t('charts.route_pressure')}
      />
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getSourceRows(overview)}
        title={t('charts.source_mix')}
      />
      <RecentErrors logs={overview?.recentErrors ?? []} t={t} />
    </div>
  );
}

export function AnalyticsPanel({
  analytics,
  overview,
  t,
}: {
  analytics: ObservabilityAnalytics | undefined;
  overview: ObservabilityOverview | undefined;
  t: MonitoringTranslator;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getStatusRows(analytics, t)}
        title={t('charts.status_distribution')}
      />
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getRouteRows(overview)}
        title={t('charts.route_pressure')}
      />
      <MiniBars
        emptyLabel={t('charts.no_data')}
        rows={getCronRows(analytics)}
        title={t('charts.cron_hotspots')}
      />
    </div>
  );
}

export function SignalsPanel({
  analytics,
  overview,
  t,
}: {
  analytics: ObservabilityAnalytics | undefined;
  overview: ObservabilityOverview | undefined;
  t: MonitoringTranslator;
}) {
  const cards: Array<{
    iconTone: MonitoringTone;
    label: string;
    value: string;
  }> = [
    {
      iconTone: 'red',
      label: t('signals.server_errors'),
      value: formatCompactNumber(overview?.serverErrorCount),
    },
    {
      iconTone: 'orange',
      label: t('signals.slow_requests'),
      value: formatCompactNumber(overview?.slowRequestCount),
    },
    {
      iconTone: 'amber',
      label: t('signals.cron_failure_rate'),
      value: formatPercent(overview?.cronFailureRate),
    },
    {
      iconTone: 'green',
      label: t('signals.active_sources'),
      value: formatCompactNumber(
        Object.keys(overview?.sourceCounts ?? {}).length
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            className={cn(
              'rounded-lg border bg-background p-4',
              toneClasses[card.iconTone].soft
            )}
            key={card.label}
          >
            <FileText
              className={cn('mb-4 h-4 w-4', toneClasses[card.iconTone].text)}
            />
            <p className="text-muted-foreground text-xs">{card.label}</p>
            <p className="mt-2 font-semibold text-2xl">{card.value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <MiniBars
          emptyLabel={t('charts.no_data')}
          rows={getRouteRows(overview)}
          title={t('charts.latency_pressure')}
        />
        <MiniBars
          emptyLabel={t('charts.no_data')}
          rows={getCronRows(analytics)}
          title={t('charts.cron_hotspots')}
        />
        <MiniBars
          emptyLabel={t('charts.no_data')}
          rows={getSourceRows(overview)}
          title={t('charts.source_mix')}
        />
        <RecentErrors logs={overview?.recentErrors ?? []} t={t} />
      </div>
    </div>
  );
}

function RecentErrors({
  logs,
  t,
}: {
  logs: ObservabilityLogEvent[];
  t: MonitoringTranslator;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3 font-medium text-sm">
        {t('recent_errors')}
      </div>
      {logs.length > 0 ? (
        <div className="divide-y divide-border/60">
          {logs.map((log) => (
            <div className="grid gap-2 px-4 py-3 text-sm" key={log.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{log.message}</span>
                <span
                  className={cn('font-mono text-xs', statusClass(log.status))}
                >
                  {log.status ?? '-'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                <span>{formatDateTime(log.createdAt)}</span>
                <span>{log.source}</span>
                <span className="truncate font-mono">
                  {log.route ?? log.requestId ?? '-'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-12 text-center text-muted-foreground text-sm">
          {t('charts.no_data')}
        </div>
      )}
    </section>
  );
}
