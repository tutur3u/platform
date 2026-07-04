'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Box,
  CalendarClock,
  DatabaseZap,
  FileText,
  Gauge,
  Logs,
  Play,
  Power,
  Radio,
  RefreshCw,
  Search,
  Trash2,
} from '@tuturuuu/icons';
import {
  type CronExecutionRecord,
  type CronMonitoringDiagnostic,
  createInfrastructureProject,
  deleteInfrastructureProject,
  type GetObservabilityParams,
  getBlueGreenMonitoringSnapshot,
  getCronMonitoringExecutionArchive,
  getCronMonitoringSnapshot,
  getInfrastructureProjects,
  getObservabilityAnalytics,
  getObservabilityCronRuns,
  getObservabilityDeployments,
  getObservabilityLogs,
  getObservabilityOverview,
  getObservabilityRequests,
  getObservabilityResources,
  type InfrastructureProject,
  type ObservabilityDeployment,
  type ObservabilityLogEvent,
  type ObservabilityRequest,
  queueCronRun,
  queueInfrastructureProjectDeploy,
  requestBlueGreenWatcherRecovery,
  requestCronRunnerRecovery,
  syncInfrastructureProject,
  type UpdateInfrastructureProjectPayload,
  updateCronMonitoringControl,
  updateInfrastructureProject,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
} from 'recharts';
import { BlueGreenMonitoringRecoverySettings } from './blue-green-monitoring-recovery-settings';
import {
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
} from './formatters';
import { ObservabilityDeploymentsPanel } from './observability-deployments-panel';
import {
  ObservabilityLogsPanel,
  type ObservabilityLogsPanelFilters,
} from './observability-logs-panel';
import { ObservabilityResourcesPanel } from './observability-resources-panel';

export type ObservabilityDashboardMode =
  | 'analytics'
  | 'cron'
  | 'deployments'
  | 'logs'
  | 'observability'
  | 'overview'
  | 'projects'
  | 'requests'
  | 'resources';

const modeIcons = {
  analytics: BarChart3,
  cron: CalendarClock,
  deployments: Box,
  logs: Logs,
  observability: DatabaseZap,
  overview: Activity,
  projects: Box,
  requests: Radio,
  resources: Gauge,
};

type LogsPage = Awaited<ReturnType<typeof getObservabilityLogs>>;
type RequestsPage = Awaited<ReturnType<typeof getObservabilityRequests>>;
type DeploymentsPage = Awaited<ReturnType<typeof getObservabilityDeployments>>;
type CronExecutionsPage = Awaited<
  ReturnType<typeof getCronMonitoringExecutionArchive>
>;
type InfiniteData<TPage> = {
  pageParams: number[];
  pages: TPage[];
};
type Tone = 'amber' | 'blue' | 'green' | 'muted' | 'orange' | 'red';
type ProjectToggleKey =
  | 'autoDeployEnabled'
  | 'cronEnabled'
  | 'logDrainEnabled'
  | 'redisEnabled';

const toneClasses: Record<
  Tone,
  { bar: string; dot: string; soft: string; text: string }
> = {
  amber: {
    bar: 'bg-dynamic-yellow',
    dot: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
  blue: {
    bar: 'bg-dynamic-blue',
    dot: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  green: {
    bar: 'bg-dynamic-green',
    dot: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  muted: {
    bar: 'bg-muted-foreground',
    dot: 'bg-muted-foreground',
    soft: 'border-border bg-muted/30',
    text: 'text-muted-foreground',
  },
  orange: {
    bar: 'bg-dynamic-orange',
    dot: 'bg-dynamic-orange',
    soft: 'border-dynamic-orange/30 bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
  },
  red: {
    bar: 'bg-dynamic-red',
    dot: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
};

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return formatCompactNumber(value).toLowerCase();
}

function formatDuration(value: number | null | undefined) {
  if (value == null) {
    return '-';
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function formatTime(value: number | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(value);
}

function formatCronUtcTimeInUserTimezone(hour: string, minute: string) {
  const hourNumber = Number.parseInt(hour, 10);
  const minuteNumber = Number.parseInt(minute, 10);

  if (
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    hourNumber < 0 ||
    hourNumber > 23 ||
    minuteNumber < 0 ||
    minuteNumber > 59
  ) {
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  const now = new Date();
  const utcDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hourNumber,
      minuteNumber
    )
  );

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(utcDate);
}

function formatClientContext({
  ipAddress,
  userAgent,
}: {
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return [ipAddress, userAgent].filter(Boolean).join(' · ');
}

function formatUserContext({
  userEmail,
  userId,
}: {
  userEmail?: string | null;
  userId?: string | null;
}) {
  return userEmail ?? userId ?? '';
}

function describeCronSchedule(
  schedule: string,
  labels: {
    dailyAt: (time: string) => string;
    everyHours: (count: string) => string;
    everyMinutes: (count: string) => string;
    raw: (schedule: string) => string;
  }
) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(/\s+/u);
  if (!(minute && hour && dayOfMonth && month && dayOfWeek)) {
    return labels.raw(schedule);
  }

  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return labels.everyMinutes(minute.slice(2));
  }

  if (
    minute === '0' &&
    hour.startsWith('*/') &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return labels.everyHours(hour.slice(2));
  }

  if (
    /^\d+$/u.test(minute) &&
    /^\d+$/u.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return labels.dailyAt(formatCronUtcTimeInUserTimezone(hour, minute));
  }

  return labels.raw(schedule);
}

function statusClass(status: number | null | undefined) {
  if (status == null) {
    return 'text-muted-foreground';
  }

  if (status >= 500) {
    return 'text-dynamic-red';
  }

  if (status >= 400) {
    return 'text-dynamic-orange';
  }

  if (status >= 300) {
    return 'text-dynamic-blue';
  }

  return 'text-dynamic-green';
}

function getStatusFamilyTone(label: string): Tone {
  if (label === 'serverError') return 'red';
  if (label === 'clientError') return 'orange';
  if (label === 'redirect') return 'blue';
  if (label === 'success') return 'green';
  return 'muted';
}

function getCronRunTone(status: string | null | undefined): Tone {
  if (status === 'success') return 'green';
  if (status === 'processing') return 'blue';
  if (status === 'queued') return 'amber';
  if (status === 'timeout') return 'orange';
  if (status === 'failed') return 'red';
  return 'muted';
}

function getCronRunnerTone(status: string | null | undefined): Tone {
  if (status === 'live') return 'green';
  if (status === 'stale') return 'orange';
  if (status === 'missing') return 'red';
  return 'muted';
}

function getCronWatchdogTone(status: string | null | undefined): Tone {
  if (status === 'healthy' || status === 'recovered') return 'green';
  if (status === 'recovering') return 'blue';
  if (status === 'cooldown') return 'amber';
  if (status === 'failed') return 'red';
  if (status === 'disabled') return 'muted';
  return 'muted';
}

function getCronDiagnosticTone(
  severity: CronMonitoringDiagnostic['severity']
): Tone {
  return severity === 'error' ? 'red' : 'orange';
}

function ToneBadge({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <Badge
      className={cn(
        'rounded-full border px-2 py-0.5 font-medium',
        toneClasses[tone].soft,
        toneClasses[tone].text
      )}
      variant="outline"
    >
      {children}
    </Badge>
  );
}

function getDeploymentStateView(
  deployment: ObservabilityDeployment,
  labels: Record<
    'building' | 'deploying' | 'error' | 'queued' | 'ready',
    string
  >
) {
  const raw = `${deployment.runtimeState ?? ''} ${deployment.status ?? ''}`
    .toLowerCase()
    .trim();

  if (raw.includes('fail') || raw.includes('error')) {
    return { label: labels.error, tone: 'red' as const };
  }

  if (raw.includes('deploy')) {
    return { label: labels.deploying, tone: 'amber' as const };
  }

  if (raw.includes('build')) {
    return { label: labels.building, tone: 'amber' as const };
  }

  if (
    raw.includes('queue') ||
    raw.includes('pending') ||
    raw.includes('waiting')
  ) {
    return { label: labels.queued, tone: 'muted' as const };
  }

  return { label: labels.ready, tone: 'green' as const };
}

function isDeploymentInProgress(deployment: ObservabilityDeployment) {
  return (
    getDeploymentStateView(deployment, {
      building: 'building',
      deploying: 'deploying',
      error: 'error',
      queued: 'queued',
      ready: 'ready',
    }).tone === 'amber'
  );
}

function LoadingSkeleton({
  className,
  rows = 1,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div className={cn('space-y-3 p-4', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className="h-12 animate-pulse rounded-md border border-border/50 bg-muted/40"
          key={index}
        />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-56 items-end gap-1 border-border border-b px-4 pb-4">
      {Array.from({ length: 24 }).map((_, index) => (
        <div
          className="flex-1 animate-pulse rounded-t bg-muted"
          key={index}
          style={{ height: `${20 + ((index * 17) % 64)}%` }}
        />
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid h-56 place-items-center border-border border-b px-4 text-muted-foreground text-sm">
      {label}
    </div>
  );
}

function getToneChartColor(tone: Tone) {
  if (tone === 'green') return 'var(--chart-2)';
  if (tone === 'red') return 'var(--chart-3)';
  if (tone === 'amber') return 'var(--chart-4)';
  if (tone === 'orange') return 'var(--chart-5)';
  if (tone === 'muted') return 'var(--muted-foreground)';
  return 'var(--chart-1)';
}

function TrendChart({
  buckets,
  emptyLabel,
  series,
  title,
}: {
  buckets: Array<{
    bucketStart: number;
    cronRuns: number;
    errors: number;
    requests: number;
    serverErrors: number;
  }>;
  emptyLabel: string;
  series: Array<{
    className: string;
    getValue: (bucket: {
      cronRuns: number;
      errors: number;
      requests: number;
      serverErrors: number;
    }) => number;
    label: string;
  }>;
  title: string;
}) {
  const chartData = buckets.map((bucket) => {
    const point: Record<string, number | string> = {
      time: formatTime(bucket.bucketStart),
      timestamp: bucket.bucketStart,
    };

    series.forEach((item, index) => {
      point[`series${index}`] = item.getValue(bucket);
    });

    return point;
  });
  const chartConfig = Object.fromEntries(
    series.map((item, index) => [
      `series${index}`,
      {
        color: `var(--chart-${(index % 5) + 1})`,
        label: item.label,
      },
    ])
  );
  const gradientId = `trend-${title.replace(/\W+/gu, '-').toLowerCase()}`;

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
        <p className="font-medium text-sm">{title}</p>
        <div className="flex flex-wrap items-center justify-end gap-3 text-muted-foreground text-xs">
          {series.map((item) => {
            const latest = [...buckets]
              .reverse()
              .map((bucket) => item.getValue(bucket))
              .find((value) => Number.isFinite(value));

            return (
              <span className="inline-flex items-center gap-1" key={item.label}>
                <span className={cn('h-2 w-2 rounded-full', item.className)} />
                {item.label}
                <span className="font-mono text-foreground">
                  {formatNumber(latest)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      {buckets.length > 0 ? (
        <ChartContainer className="h-64 w-full px-3 py-4" config={chartConfig}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-series0)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-series0)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="time"
              minTickGap={24}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value) => formatNumber(Number(value))}
              tickLine={false}
              width={48}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => [
                    formatNumber(Number(value)),
                    name,
                  ]}
                />
              }
            />
            {series.map((item, index) =>
              index === 0 ? (
                <Area
                  dataKey="series0"
                  fill={`url(#${gradientId})`}
                  key={item.label}
                  name={item.label}
                  stroke="var(--color-series0)"
                  strokeWidth={2}
                  type="monotone"
                />
              ) : (
                <Line
                  dataKey={`series${index}`}
                  dot={false}
                  key={item.label}
                  name={item.label}
                  stroke={`var(--color-series${index})`}
                  strokeWidth={2}
                  type="monotone"
                />
              )
            )}
          </ComposedChart>
        </ChartContainer>
      ) : (
        <EmptyChart label={emptyLabel} />
      )}
    </section>
  );
}

function HorizontalBars({
  emptyLabel,
  rows,
  title,
}: {
  emptyLabel: string;
  rows: Array<{ label: string; tone: Tone; value: number | null | undefined }>;
  title: string;
}) {
  const visibleRows = rows.filter((row) => (row.value ?? 0) > 0);
  const chartData = visibleRows.map((row) => ({
    label: row.label,
    tone: row.tone,
    value: row.value ?? 0,
  }));
  const chartConfig = {
    value: {
      color: 'var(--chart-1)',
      label: title,
    },
  };

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3 font-medium text-sm">
        {title}
      </div>
      {visibleRows.length > 0 ? (
        <ChartContainer className="h-72 w-full px-3 py-4" config={chartConfig}>
          <RechartsBarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 24 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              axisLine={false}
              tickFormatter={(value) => formatNumber(Number(value))}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="label"
              tickFormatter={(value) =>
                String(value).length > 18
                  ? `${String(value).slice(0, 18)}...`
                  : String(value)
              }
              tickLine={false}
              type="category"
              width={122}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [formatNumber(Number(value)), title]}
                />
              }
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((row) => (
                <Cell fill={getToneChartColor(row.tone)} key={row.label} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ChartContainer>
      ) : (
        <div className="px-4 py-12 text-center text-muted-foreground text-sm">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  meta,
  value,
}: {
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="border-border/70 border-r border-b bg-background px-5 py-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
      {meta ? (
        <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
      ) : null}
    </div>
  );
}

function LogRow({ log }: { log: ObservabilityLogEvent }) {
  const clientContext = formatClientContext(log);
  const userContext = formatUserContext(log);

  return (
    <div className="grid grid-cols-[140px_72px_90px_minmax(0,1fr)] items-start gap-4 border-border/50 border-b px-4 py-3 font-mono text-xs">
      <span className="text-muted-foreground">{formatTime(log.createdAt)}</span>
      <span
        className={cn(
          'font-semibold uppercase',
          log.level === 'error'
            ? 'text-dynamic-red'
            : log.level === 'warn'
              ? 'text-dynamic-orange'
              : 'text-muted-foreground'
        )}
      >
        {log.level}
      </span>
      <span className={statusClass(log.status)}>{log.status ?? '-'}</span>
      <div className="min-w-0">
        <p className="truncate text-foreground">{log.message}</p>
        <p className="mt-1 truncate text-muted-foreground">
          {log.route ?? log.requestId ?? log.source}
        </p>
        {clientContext ? (
          <p className="mt-1 truncate text-muted-foreground">{clientContext}</p>
        ) : null}
        {userContext ? (
          <p className="mt-1 truncate text-muted-foreground">{userContext}</p>
        ) : null}
      </div>
    </div>
  );
}

function RequestRow({ request }: { request: ObservabilityRequest }) {
  const clientContext = formatClientContext(request);
  const userContext = formatUserContext(request);
  const relatedLogs = request.relatedLogs.slice(0, 2);

  return (
    <div className="grid h-full grid-cols-[140px_72px_76px_minmax(0,1fr)_90px] items-start gap-4 border-border/50 border-b px-4 py-3 font-mono text-xs">
      <span className="text-muted-foreground">
        {formatTime(request.startedAt)}
      </span>
      <span>{request.method ?? request.source.toUpperCase()}</span>
      <span className={statusClass(request.status)}>
        {request.status ?? '-'}
      </span>
      <div className="min-w-0">
        <p className="truncate">{request.path ?? request.id}</p>
        {clientContext ? (
          <p className="mt-1 truncate text-muted-foreground">{clientContext}</p>
        ) : null}
        {userContext ? (
          <p className="mt-1 truncate text-muted-foreground">{userContext}</p>
        ) : null}
        {relatedLogs.length > 0 ? (
          <div className="mt-2 space-y-1">
            {relatedLogs.map((log) => (
              <p className="truncate text-muted-foreground" key={log.id}>
                <span className={cn('uppercase', statusClass(log.status))}>
                  {log.level}
                </span>{' '}
                {log.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <span className="text-muted-foreground">
        {formatDuration(request.durationMs)}
      </span>
    </div>
  );
}

function getProjectStatusTone(status: string | null | undefined): Tone {
  if (status === 'failed' || status === 'blocked') {
    return 'red';
  }

  if (status === 'building' || status === 'deploying') {
    return 'amber';
  }

  if (status === 'queued') {
    return 'muted';
  }

  if (status === 'ready' || status === 'synced') {
    return 'green';
  }

  return 'muted';
}

function getProjectServiceNeedle(projectId: string) {
  return `project-${projectId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')}`;
}

function getWatcherTone(health: string | null | undefined): Tone {
  if (health === 'live') {
    return 'green';
  }

  if (health === 'stale') {
    return 'amber';
  }

  if (health === 'offline') {
    return 'orange';
  }

  return 'red';
}

function VirtualizedList<T>({
  empty,
  estimateRowHeight,
  hasMore,
  height = 560,
  isFetchingMore,
  items,
  onEndReached,
  renderRow,
}: {
  empty: ReactNode;
  estimateRowHeight: number;
  hasMore: boolean;
  height?: number;
  isFetchingMore: boolean;
  items: T[];
  onEndReached: () => void;
  renderRow: (item: T, index: number) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 8;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / estimateRowHeight) - overscan
  );
  const visibleCount = Math.ceil(height / estimateRowHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const virtualItems = items.slice(startIndex, endIndex);

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-muted-foreground text-sm">
        {empty}
      </div>
    );
  }

  return (
    <div
      className="overflow-auto"
      onScroll={(event) => {
        const target = event.currentTarget;
        setScrollTop(target.scrollTop);

        if (
          hasMore &&
          !isFetchingMore &&
          target.scrollHeight - target.scrollTop - target.clientHeight <
            estimateRowHeight * 6
        ) {
          onEndReached();
        }
      }}
      style={{ height }}
    >
      <div
        className="relative"
        style={{ height: items.length * estimateRowHeight }}
      >
        {virtualItems.map((item, offset) => {
          const index = startIndex + offset;
          return (
            <div
              className="absolute inset-x-0"
              key={index}
              style={{
                height: estimateRowHeight,
                transform: `translateY(${index * estimateRowHeight}px)`,
              }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfiniteFooter({
  endLabel,
  hasMore,
  isFetchingMore,
  loadingLabel,
  loaded,
  moreLabel,
  total,
}: {
  endLabel: string;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadingLabel: string;
  loaded: number;
  moreLabel: string;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between border-border/60 border-t px-4 py-3 text-muted-foreground text-xs">
      <span>
        {formatNumber(loaded)} / {formatNumber(total)}
      </span>
      <span>
        {isFetchingMore ? loadingLabel : hasMore ? moreLabel : endLabel}
      </span>
    </div>
  );
}

export function ObservabilityDashboardClient({
  mode,
}: {
  mode: ObservabilityDashboardMode;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const cronT = useTranslations('blue-green-monitoring.cron');
  const queryClient = useQueryClient();
  const Icon = modeIcons[mode];
  const [timeframeHours, setTimeframeHours] = useQueryState(
    'hours',
    parseAsInteger.withDefault(24).withOptions({ shallow: true })
  );
  const [query, setQuery] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [level, setLevel] = useQueryState(
    'level',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [source, setSource] = useQueryState(
    'source',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [statusFilter, setStatusFilter] = useQueryState(
    'status',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [routeFilter, setRouteFilter] = useQueryState(
    'route',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [requestIdFilter, setRequestIdFilter] = useQueryState(
    'requestId',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [userFilter, setUserFilter] = useQueryState(
    'user',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [deploymentStampFilter, setDeploymentStampFilter] = useQueryState(
    'deploymentStamp',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [projectId, setProjectId] = useQueryState(
    'project',
    parseAsString.withDefault('platform').withOptions({ shallow: true })
  );
  const [focus] = useQueryState(
    'focus',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [pageSize] = useQueryState(
    'limit',
    parseAsInteger.withDefault(100).withOptions({ shallow: true })
  );
  const [projectRepoUrl, setProjectRepoUrl] = useState('');
  const [projectHostnames, setProjectHostnames] = useState('');
  const [projectAppRoot, setProjectAppRoot] = useState('');
  const [logsPaused, setLogsPaused] = useState(false);
  const [requestFreezeUntil, setRequestFreezeUntil] = useState(() =>
    Date.now()
  );
  const [selectedExecution, setSelectedExecution] =
    useState<CronExecutionRecord | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<InfrastructureProject | null>(null);
  const filters: GetObservabilityParams = useMemo(
    () => ({
      deploymentStamp: deploymentStampFilter || undefined,
      level: level as GetObservabilityParams['level'],
      pageSize,
      projectId,
      q: query || undefined,
      requestId: requestIdFilter || undefined,
      route: routeFilter === 'all' ? undefined : routeFilter,
      source: source as GetObservabilityParams['source'],
      status: statusFilter === 'all' ? undefined : statusFilter,
      timeframeHours,
      user: userFilter || undefined,
    }),
    [
      deploymentStampFilter,
      level,
      pageSize,
      projectId,
      query,
      requestIdFilter,
      routeFilter,
      source,
      statusFilter,
      timeframeHours,
      userFilter,
    ]
  );
  const projectsQuery = useQuery({
    queryFn: () => getInfrastructureProjects(),
    queryKey: ['infrastructure', 'projects'],
    refetchInterval: mode === 'projects' ? 10_000 : 30_000,
  });
  const watcherQuery = useQuery({
    enabled:
      mode === 'projects' || mode === 'overview' || mode === 'deployments',
    queryFn: () => getBlueGreenMonitoringSnapshot({ watcherLogLimit: 4 }),
    queryKey: ['infrastructure', 'monitoring', 'blue-green', 'watcher'],
    refetchInterval: 5_000,
  });
  const overviewQuery = useQuery({
    queryFn: () => getObservabilityOverview({ projectId, timeframeHours }),
    queryKey: [
      'infrastructure',
      'observability',
      'overview',
      projectId,
      timeframeHours,
    ],
    refetchInterval: mode === 'logs' ? 10_000 : 30_000,
  });
  const analyticsQuery = useQuery({
    enabled:
      mode === 'analytics' || mode === 'observability' || mode === 'overview',
    queryFn: () => getObservabilityAnalytics({ projectId, timeframeHours }),
    queryKey: [
      'infrastructure',
      'observability',
      'analytics',
      projectId,
      timeframeHours,
    ],
  });
  const logsQuery = useInfiniteQuery<
    LogsPage,
    Error,
    InfiniteData<LogsPage>,
    readonly unknown[],
    number
  >({
    enabled: mode === 'logs',
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getObservabilityLogs({ ...filters, page: pageParam }),
    queryKey: ['infrastructure', 'observability', 'logs', filters],
    refetchInterval: logsPaused ? false : 5_000,
  });
  const requestsQuery = useInfiniteQuery<
    RequestsPage,
    Error,
    InfiniteData<RequestsPage>,
    readonly unknown[],
    number
  >({
    enabled: mode === 'requests',
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getObservabilityRequests({
        ...filters,
        page: pageParam,
        until: requestFreezeUntil,
      }),
    queryKey: [
      'infrastructure',
      'observability',
      'requests',
      filters,
      requestFreezeUntil,
    ],
  });
  const newRequestsQuery = useQuery({
    enabled: mode === 'requests',
    queryFn: () =>
      getObservabilityRequests({
        ...filters,
        page: 1,
        pageSize: 1,
        since: requestFreezeUntil,
      }),
    queryKey: [
      'infrastructure',
      'observability',
      'requests-new',
      filters,
      requestFreezeUntil,
    ],
    refetchInterval: 5_000,
  });
  const deploymentsQuery = useInfiniteQuery<
    DeploymentsPage,
    Error,
    InfiniteData<DeploymentsPage>,
    readonly unknown[],
    number
  >({
    enabled: mode === 'deployments',
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getObservabilityDeployments({ ...filters, page: pageParam }),
    queryKey: ['infrastructure', 'observability', 'deployments', filters],
    refetchInterval: (query) => {
      const data = query.state.data as
        | InfiniteData<DeploymentsPage>
        | undefined;
      const items = data?.pages.flatMap((page) => page.items) ?? [];
      return items.some(isDeploymentInProgress) ? 2_000 : false;
    },
  });
  const cronQuery = useQuery({
    enabled: mode === 'cron' || mode === 'observability',
    queryFn: () => getObservabilityCronRuns(filters),
    queryKey: ['infrastructure', 'observability', 'cron-runs', filters],
  });
  const cronSnapshotQuery = useQuery({
    enabled: mode === 'cron',
    queryFn: () => getCronMonitoringSnapshot(),
    queryKey: ['infrastructure', 'monitoring', 'cron', 'snapshot'],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.runnerRecoveryRequest ||
        data?.recovery.directControl.status === 'stale' ||
        data?.recovery.directControl.watchdog?.status === 'recovering'
        ? 1000
        : 5000;
    },
  });
  const cronExecutionsQuery = useInfiniteQuery<
    CronExecutionsPage,
    Error,
    InfiniteData<CronExecutionsPage>,
    readonly unknown[],
    number
  >({
    enabled: mode === 'cron',
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getCronMonitoringExecutionArchive({
        page: pageParam,
        pageSize,
      }),
    queryKey: ['infrastructure', 'monitoring', 'cron', 'executions', pageSize],
    refetchInterval: 5_000,
  });
  const resourcesQuery = useQuery({
    enabled: mode === 'resources',
    queryFn: () => getObservabilityResources({ projectId, timeframeHours }),
    queryKey: [
      'infrastructure',
      'observability',
      'resources',
      projectId,
      timeframeHours,
    ],
    refetchInterval: 5_000,
  });
  const createProjectMutation = useMutation({
    mutationFn: () =>
      createInfrastructureProject({
        appRoot: projectAppRoot,
        hostnames: projectHostnames
          .split(',')
          .map((hostname) => hostname.trim())
          .filter(Boolean),
        repoUrl: projectRepoUrl,
      }),
    onSuccess: (response) => {
      setProjectRepoUrl('');
      setProjectHostnames('');
      setProjectAppRoot('');
      void setProjectId(response.project.id);
      void queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'projects'],
      });
    },
  });
  const updateProjectMutation = useMutation({
    mutationFn: ({
      payload,
      project,
    }: {
      payload: Parameters<typeof updateInfrastructureProject>[1];
      project: InfrastructureProject;
    }) => updateInfrastructureProject(project.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'projects'],
      });
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'observability'],
      });
    },
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (project: InfrastructureProject) =>
      deleteInfrastructureProject(project.id),
    onSuccess: (response) => {
      setProjectPendingDelete(null);
      if (response.project.id === projectId) {
        void setProjectId('platform');
      }
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'projects'],
      });
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'observability'],
      });
    },
  });
  const syncProjectMutation = useMutation({
    mutationFn: (project: InfrastructureProject) =>
      syncInfrastructureProject(project.id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'projects'],
      }),
  });
  const queueProjectDeployMutation = useMutation({
    mutationFn: (project: InfrastructureProject) =>
      queueInfrastructureProjectDeploy(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'projects'],
      });
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'observability'],
      });
    },
  });
  const runCronMutation = useMutation({
    mutationFn: (jobId: string) => queueCronRun({ jobId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'cron'],
      }),
  });
  const cronControlMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; jobId?: string }) =>
      updateCronMonitoringControl(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'cron'],
      }),
  });
  const cronRunnerRecoveryMutation = useMutation({
    mutationFn: (action: 'ensure' | 'restart') =>
      requestCronRunnerRecovery({
        action,
        reason:
          action === 'restart'
            ? 'operator-requested-restart'
            : 'operator-requested-ensure',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'cron'],
      }),
  });
  const overview = overviewQuery.data;
  const analytics = analyticsQuery.data;
  const cronSnapshot = cronSnapshotQuery.data;
  const cronDiagnostics = cronSnapshot?.diagnostics ?? [];
  const cronWatchdog = cronSnapshot?.recovery.directControl.watchdog ?? null;
  const watcher = watcherQuery.data?.watcher;
  const projects = projectsQuery.data?.projects ?? [];
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null;
  const watcherTargetBranch = watcher?.target?.branch ?? null;
  const selectedProjectWatcherBranchMismatch =
    selectedProject?.id === 'platform' &&
    selectedProject.deploymentStatus === 'queued' &&
    watcher?.health === 'live' &&
    typeof watcherTargetBranch === 'string' &&
    watcherTargetBranch !== selectedProject.selectedBranch;
  const selectedProjectWatcherUnhealthy =
    selectedProject?.deploymentStatus === 'queued' &&
    watcherQuery.isFetched &&
    watcher?.health !== 'live';
  const watcherRecoveryReason = selectedProjectWatcherBranchMismatch
    ? 'branch-mismatch'
    : selectedProjectWatcherUnhealthy
      ? 'watcher-unhealthy'
      : null;
  const watcherRecoveryQuery = useQuery({
    enabled: Boolean(selectedProject?.id && watcherRecoveryReason),
    gcTime: 60_000,
    queryFn: () =>
      requestBlueGreenWatcherRecovery({
        projectBranch: selectedProject?.selectedBranch ?? null,
        projectId: selectedProject?.id ?? 'platform',
        reason: watcherRecoveryReason ?? 'unknown',
        watcherBranch: watcherTargetBranch,
        watcherHealth: watcher?.health ?? null,
      }),
    queryKey: [
      'infrastructure',
      'monitoring',
      'blue-green',
      'watcher-recovery',
      selectedProject?.id,
      selectedProject?.selectedBranch,
      watcherRecoveryReason,
      watcherTargetBranch,
      watcher?.health,
    ],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60_000,
  });
  const resources = resourcesQuery.data?.dockerResources;
  const logs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [logsQuery.data]
  );
  const logFacets = logsQuery.data?.pages[0]?.facets;
  const requests = useMemo(
    () => requestsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [requestsQuery.data]
  );
  const deployments = useMemo(
    () => deploymentsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [deploymentsQuery.data]
  );
  const cronExecutions = useMemo(
    () => cronExecutionsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [cronExecutionsQuery.data]
  );
  const logsTotal = logsQuery.data?.pages[0]?.total ?? 0;
  const requestsTotal = requestsQuery.data?.pages[0]?.total ?? 0;
  const deploymentsTotal = deploymentsQuery.data?.pages[0]?.total ?? 0;
  const cronExecutionsTotal = cronExecutionsQuery.data?.pages[0]?.total ?? 0;
  const newRequestCount = newRequestsQuery.data?.total ?? 0;
  const scopedContainers = useMemo(() => {
    const containers = resources?.allContainers ?? [];
    if (projectId === 'platform') {
      return containers.filter(
        (container) =>
          !String(container.serviceName ?? container.name).startsWith(
            'project-'
          )
      );
    }

    const projectServiceNeedle = getProjectServiceNeedle(projectId);
    return containers.filter((container) =>
      [container.serviceName, container.name]
        .filter(Boolean)
        .some((value) => String(value).includes(projectServiceNeedle))
    );
  }, [projectId, resources?.allContainers]);
  useEffect(() => {
    setRequestFreezeUntil((current) => (projectId ? Date.now() : current));
  }, [projectId]);
  const infiniteLabels = {
    end: t('infinite.end'),
    loading: t('infinite.loading'),
    more: t('infinite.more'),
  };
  const cronScheduleLabels = {
    dailyAt: (time: string) => cronT('schedule.daily_at', { time }),
    everyHours: (count: string) => cronT('schedule.every_hours', { count }),
    everyMinutes: (count: string) => cronT('schedule.every_minutes', { count }),
    raw: (schedule: string) => cronT('schedule.raw', { schedule }),
  };
  const statusFamilyLabels = {
    clientError: t('status_families.clientError'),
    redirect: t('status_families.redirect'),
    serverError: t('status_families.serverError'),
    success: t('status_families.success'),
    unknown: t('status_families.unknown'),
  };
  const analyticsBuckets = analytics?.buckets ?? [];
  const statusRows = Object.entries(analytics?.statusFamilies ?? {}).map(
    ([label, value]) => ({
      label:
        statusFamilyLabels[label as keyof typeof statusFamilyLabels] ?? label,
      tone: getStatusFamilyTone(label),
      value,
    })
  );
  const sourceRows = Object.entries(overview?.sourceCounts ?? {}).map(
    ([label, value]) => ({
      label: label.toUpperCase(),
      tone: (label === 'cron'
        ? 'amber'
        : label === 'api'
          ? 'blue'
          : 'green') as Tone,
      value,
    })
  );
  const topRouteRows = (overview?.topRoutes ?? []).map((route) => ({
    label: route.path,
    tone: route.errorCount > 0 ? ('red' as const) : ('blue' as const),
    value: route.requestCount,
  }));
  const slowRouteRows = (analytics?.topRoutes ?? overview?.topRoutes ?? []).map(
    (route) => ({
      label: route.path,
      tone: route.errorCount > 0 ? ('red' as const) : ('orange' as const),
      value: route.averageDurationMs ?? 0,
    })
  );
  const cronJobRows = (analytics?.topCronJobs ?? []).map((job) => ({
    label: job.jobId,
    tone: job.failureCount > 0 ? ('red' as const) : ('green' as const),
    value: job.runCount,
  }));
  const logPanelFilters: ObservabilityLogsPanelFilters = {
    deploymentStamp: deploymentStampFilter,
    level,
    query,
    requestId: requestIdFilter,
    route: routeFilter,
    source,
    status: statusFilter,
    user: userFilter,
  };
  const setLogPanelFilters = (
    nextFilters: Partial<ObservabilityLogsPanelFilters>
  ) => {
    if (nextFilters.query != null) void setQuery(nextFilters.query);
    if (nextFilters.level != null) void setLevel(nextFilters.level);
    if (nextFilters.source != null) void setSource(nextFilters.source);
    if (nextFilters.status != null) void setStatusFilter(nextFilters.status);
    if (nextFilters.route != null) void setRouteFilter(nextFilters.route);
    if (nextFilters.requestId != null) {
      void setRequestIdFilter(nextFilters.requestId);
    }
    if (nextFilters.user != null) {
      void setUserFilter(nextFilters.user);
    }
    if (nextFilters.deploymentStamp != null) {
      void setDeploymentStampFilter(nextFilters.deploymentStamp);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-border border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-border bg-background p-2">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{t(`${mode}.title`)}</h2>
            <p className="text-muted-foreground text-sm">
              {t(`${mode}.description`)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 max-w-52 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) => void setProjectId(event.target.value)}
            value={projectId}
          >
            {(projects.length > 0 ? projects : []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            {projects.length === 0 && (
              <option value={projectId}>{projectId}</option>
            )}
          </select>
          <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="w-52 bg-transparent outline-none"
              onChange={(event) => void setQuery(event.target.value)}
              placeholder={t('search_placeholder')}
              value={query}
            />
          </label>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) => void setSource(event.target.value)}
            value={source}
          >
            <option value="all">{t('all_sources')}</option>
            <option value="api">API</option>
            <option value="cron">Cron</option>
            <option value="server">Server</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) => void setLevel(event.target.value)}
            value={level}
          >
            <option value="all">{t('all_levels')}</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) =>
              void setTimeframeHours(Number.parseInt(event.target.value, 10))
            }
            value={timeframeHours}
          >
            <option value={1}>{t('last_hour')}</option>
            <option value={6}>{t('last_6_hours')}</option>
            <option value={12}>{t('last_12_hours')}</option>
            <option value={24}>{t('last_24_hours')}</option>
            <option value={72}>{t('last_3_days')}</option>
            <option value={168}>{t('last_7_days')}</option>
          </select>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm"
            onClick={() => {
              void overviewQuery.refetch();
              void logsQuery.refetch();
              void requestsQuery.refetch();
              void deploymentsQuery.refetch();
              void cronQuery.refetch();
              void analyticsQuery.refetch();
              void cronSnapshotQuery.refetch();
              void cronExecutionsQuery.refetch();
              void resourcesQuery.refetch();
              void projectsQuery.refetch();
              void watcherQuery.refetch();
            }}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            {t('refresh')}
          </button>
        </div>
      </div>

      {overviewQuery.isLoading ? (
        <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
        </section>
      ) : (
        <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
          <MetricCard
            label={t('metrics.requests')}
            meta={t('metrics.requests_meta')}
            value={formatNumber(overview?.requestCount)}
          />
          <MetricCard
            label={t('metrics.errors')}
            meta={`${formatNumber(overview?.errorRate)}%`}
            value={formatNumber(overview?.serverErrorCount)}
          />
          <MetricCard
            label={t('metrics.p95')}
            meta={t('metrics.p95_meta')}
            value={formatLatencyMs(overview?.p95DurationMs)}
          />
          <MetricCard
            label={t('metrics.cron')}
            meta={`${formatNumber(overview?.cronFailureRate)}%`}
            value={formatNumber(cronQuery.data?.total ?? 0)}
          />
        </section>
      )}

      {selectedProject ? (
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs uppercase">
                  {t('scope.title')}
                </span>
                <ToneBadge
                  tone={getProjectStatusTone(selectedProject.deploymentStatus)}
                >
                  {selectedProject.deploymentStatus}
                </ToneBadge>
                <ToneBadge tone="blue">
                  {selectedProject.selectedBranch}
                </ToneBadge>
                <ToneBadge tone={getWatcherTone(watcher?.health)}>
                  {t('watcher.badge', {
                    health: watcher?.health ?? 'missing',
                  })}
                </ToneBadge>
                {selectedProject.isBuiltin ? (
                  <ToneBadge tone="green">{t('projects.builtin')}</ToneBadge>
                ) : null}
              </div>
              <h3 className="mt-2 truncate font-semibold text-base">
                {selectedProject.name}
              </h3>
              <p className="mt-1 truncate text-muted-foreground text-xs">
                {t('scope.meta', {
                  project: selectedProject.id,
                })}
              </p>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-[650px] lg:grid-cols-5">
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-muted-foreground">
                  {t('projects.latest_commit')}
                </p>
                <p className="mt-1 truncate font-mono">
                  {selectedProject.latestCommitShortHash ?? '-'}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-muted-foreground">{t('projects.synced')}</p>
                <p className="mt-1">
                  {formatTime(selectedProject.latestSyncedAt)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-muted-foreground">
                  {t('projects.hostnames')}
                </p>
                <p className="mt-1 truncate">
                  {selectedProject.hostnames.join(', ') || '-'}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-muted-foreground">{t('scope.addons')}</p>
                <p className="mt-1 truncate">
                  {[
                    selectedProject.addons.logDrain ? 'Logs' : null,
                    selectedProject.addons.redis ? 'Redis' : null,
                    selectedProject.addons.cron ? 'Cron' : null,
                    'Nginx',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-muted-foreground">{t('watcher.title')}</p>
                <p className="mt-1 truncate">
                  {watcher?.target?.branch ?? '-'} ·{' '}
                  {formatTime(watcher?.lastCheckAt)}
                </p>
              </div>
            </div>
          </div>
          {selectedProject.deploymentStatus === 'queued' &&
          watcher?.health !== 'live' ? (
            <div className="mt-4 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-sm">
              <p>
                {t('watcher.not_live_queued', {
                  health: watcher?.health ?? 'missing',
                })}
              </p>
              <p className="mt-1 text-xs">
                {watcherRecoveryQuery.isError
                  ? t('watcher.recovery_failed')
                  : t('watcher.recovery_requested')}
              </p>
            </div>
          ) : selectedProjectWatcherBranchMismatch ? (
            <div className="mt-4 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-sm">
              <p>
                {t('watcher.branch_mismatch_queued', {
                  projectBranch: selectedProject.selectedBranch,
                  watcherBranch: watcherTargetBranch,
                })}
              </p>
              <p className="mt-1 text-xs">
                {watcherRecoveryQuery.isError
                  ? t('watcher.recovery_failed')
                  : t('watcher.recovery_requested')}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedProject?.id === 'platform' && watcherQuery.data ? (
        <BlueGreenMonitoringRecoverySettings snapshot={watcherQuery.data} />
      ) : null}

      {mode === 'projects' && (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-background">
            <div className="grid gap-3 border-border border-b p-4 lg:grid-cols-[minmax(0,1fr)_180px_260px_auto]">
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  {t('projects.repo_url')}
                </span>
                <input
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                  onChange={(event) => setProjectRepoUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo"
                  value={projectRepoUrl}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  {t('projects.app_root')}
                </span>
                <input
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                  onChange={(event) => setProjectAppRoot(event.target.value)}
                  placeholder={t('projects.repo_root')}
                  value={projectAppRoot}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  {t('projects.hostnames')}
                </span>
                <input
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                  onChange={(event) => setProjectHostnames(event.target.value)}
                  placeholder="app.example.com, admin.example.com"
                  value={projectHostnames}
                />
              </label>
              <div className="flex items-end">
                <Button
                  className="h-9"
                  disabled={
                    createProjectMutation.isPending || !projectRepoUrl.trim()
                  }
                  onClick={() => createProjectMutation.mutate()}
                  type="button"
                >
                  {t('projects.import')}
                </Button>
              </div>
            </div>
            {createProjectMutation.error && (
              <p className="border-border border-b px-4 py-3 text-dynamic-red text-sm">
                {createProjectMutation.error.message}
              </p>
            )}
            {projectsQuery.isLoading ? (
              <LoadingSkeleton rows={6} />
            ) : projects.length === 0 ? (
              <div className="px-4 py-8 text-muted-foreground text-sm">
                {t('projects.empty')}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {projects.map((project) => {
                  const statusTone = getProjectStatusTone(
                    project.deploymentStatus
                  );
                  const isScoped = project.id === projectId;

                  return (
                    <article
                      className={cn(
                        'grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.8fr)_minmax(260px,1fr)]',
                        isScoped && 'bg-dynamic-blue/5'
                      )}
                      key={project.id}
                    >
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="truncate text-left font-semibold text-sm"
                            onClick={() => void setProjectId(project.id)}
                            type="button"
                          >
                            {project.name}
                          </button>
                          {project.isBuiltin && (
                            <Badge variant="secondary">
                              {t('projects.builtin')}
                            </Badge>
                          )}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs',
                              toneClasses[statusTone].text
                            )}
                          >
                            <span
                              className={cn(
                                'h-2 w-2 rounded-full',
                                toneClasses[statusTone].dot
                              )}
                            />
                            {project.deploymentStatus}
                          </span>
                          {isScoped ? (
                            <Badge variant="outline">{t('scope.active')}</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-muted-foreground text-xs">
                          {project.repo.url}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">Next.js</Badge>
                          <Badge variant="secondary">
                            {t('projects.proxy_locked')}
                          </Badge>
                          <Badge
                            variant={
                              project.addons.logDrain ? 'default' : 'secondary'
                            }
                          >
                            {t('projects.log_drain')}
                          </Badge>
                          <Badge
                            variant={
                              project.addons.redis ? 'default' : 'secondary'
                            }
                          >
                            Redis
                          </Badge>
                          <Badge
                            variant={
                              project.addons.cron ? 'default' : 'secondary'
                            }
                          >
                            Cron
                          </Badge>
                        </div>
                        <div className="grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">
                              {t('projects.latest_commit')}
                            </span>
                            <p className="truncate font-mono">
                              {project.latestCommitShortHash ?? '-'}{' '}
                              <span className="font-sans font-semibold">
                                {project.latestCommitSubject ?? ''}
                              </span>
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t('projects.synced')}
                            </span>
                            <p>{formatTime(project.latestSyncedAt)}</p>
                          </div>
                        </div>
                        {project.deploymentStatus === 'queued' ? (
                          <div
                            className={cn(
                              'rounded-md border px-3 py-2 text-xs',
                              watcher?.health === 'live' &&
                                !(
                                  project.id === 'platform' &&
                                  watcherTargetBranch &&
                                  watcherTargetBranch !== project.selectedBranch
                                )
                                ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                                : 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                            )}
                          >
                            {watcher?.health !== 'live'
                              ? t('watcher.not_live_queued', {
                                  health: watcher?.health ?? 'missing',
                                })
                              : project.id === 'platform' &&
                                  watcherTargetBranch &&
                                  watcherTargetBranch !== project.selectedBranch
                                ? t('watcher.branch_mismatch_queued', {
                                    projectBranch: project.selectedBranch,
                                    watcherBranch: watcherTargetBranch,
                                  })
                                : t('projects.queued_hint')}
                            {project.id === selectedProject?.id &&
                            watcherRecoveryReason ? (
                              <p className="mt-1">
                                {watcherRecoveryQuery.isError
                                  ? t('watcher.recovery_failed')
                                  : t('watcher.recovery_requested')}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <label className="block space-y-1 text-sm">
                          <span className="text-muted-foreground text-xs">
                            {t('projects.branch')}
                          </span>
                          <select
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                            onChange={(event) =>
                              updateProjectMutation.mutate({
                                payload: {
                                  selectedBranch: event.target.value,
                                },
                                project,
                              })
                            }
                            value={project.selectedBranch}
                          >
                            {project.branches.length === 0 && (
                              <option value={project.selectedBranch}>
                                {project.selectedBranch}
                              </option>
                            )}
                            {project.branches.map((branch) => (
                              <option key={branch.name} value={branch.name}>
                                {branch.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1 text-sm">
                          <span className="text-muted-foreground text-xs">
                            {t('projects.app_root')}
                          </span>
                          <input
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                            defaultValue={project.appRoot}
                            onBlur={(event) =>
                              updateProjectMutation.mutate({
                                payload: { appRoot: event.target.value },
                                project,
                              })
                            }
                            placeholder={t('projects.repo_root')}
                          />
                        </label>
                        <label className="block space-y-1 text-sm">
                          <span className="text-muted-foreground text-xs">
                            {t('projects.hostnames')}
                          </span>
                          <input
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                            defaultValue={project.hostnames.join(', ')}
                            onBlur={(event) =>
                              updateProjectMutation.mutate({
                                payload: {
                                  hostnames: event.target.value
                                    .split(',')
                                    .map((hostname) => hostname.trim())
                                    .filter(Boolean),
                                },
                                project,
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="space-y-3">
                        {(
                          [
                            {
                              checked: project.autoDeployEnabled,
                              key: 'autoDeployEnabled',
                              label: t('projects.auto_deploy'),
                            },
                            {
                              checked: project.addons.logDrain,
                              key: 'logDrainEnabled',
                              label: t('projects.log_drain'),
                            },
                            {
                              checked: project.addons.redis,
                              key: 'redisEnabled',
                              label: t('projects.redis'),
                            },
                            {
                              checked: project.addons.cron,
                              key: 'cronEnabled',
                              label: t('projects.cron'),
                            },
                          ] satisfies Array<{
                            checked: boolean;
                            key: ProjectToggleKey;
                            label: string;
                          }>
                        ).map(({ checked, key, label }) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                            key={String(key)}
                          >
                            <span>{label}</span>
                            <Switch
                              checked={Boolean(checked)}
                              disabled={updateProjectMutation.isPending}
                              onCheckedChange={(enabled) =>
                                updateProjectMutation.mutate({
                                  payload: {
                                    [key]: enabled,
                                  } as UpdateInfrastructureProjectPayload,
                                  project,
                                })
                              }
                            />
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                          <span>{t('projects.nginx_proxy')}</span>
                          <Badge variant="secondary">
                            {t('projects.locked')}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!isScoped ? (
                            <Button
                              onClick={() => void setProjectId(project.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Radio className="h-4 w-4" />
                              {t('scope.use')}
                            </Button>
                          ) : null}
                          <Button
                            disabled={syncProjectMutation.isPending}
                            onClick={() => syncProjectMutation.mutate(project)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <RefreshCw className="h-4 w-4" />
                            {t('projects.sync')}
                          </Button>
                          <Button
                            disabled={queueProjectDeployMutation.isPending}
                            onClick={() =>
                              queueProjectDeployMutation.mutate(project)
                            }
                            size="sm"
                            type="button"
                          >
                            <Play className="h-4 w-4" />
                            {t('projects.deploy')}
                          </Button>
                          {!project.isBuiltin ? (
                            <Button
                              disabled={deleteProjectMutation.isPending}
                              onClick={() => setProjectPendingDelete(project)}
                              size="sm"
                              type="button"
                              variant="destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              {t('projects.delete')}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setProjectPendingDelete(null);
          }
        }}
        open={Boolean(projectPendingDelete)}
      >
        <DialogContent>
          {projectPendingDelete ? (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{t('projects.delete_title')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  {t('projects.delete_description', {
                    name: projectPendingDelete.name,
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t('projects.delete_meta')}
                </p>
                {deleteProjectMutation.error ? (
                  <p className="rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red">
                    {deleteProjectMutation.error.message}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setProjectPendingDelete(null)}
                  type="button"
                  variant="outline"
                >
                  {t('projects.delete_cancel')}
                </Button>
                <Button
                  disabled={deleteProjectMutation.isPending}
                  onClick={() =>
                    deleteProjectMutation.mutate(projectPendingDelete)
                  }
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteProjectMutation.isPending
                    ? t('projects.delete_pending')
                    : t('projects.delete_confirm')}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {mode === 'overview' &&
        (analyticsQuery.isLoading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-border bg-background">
              <ChartSkeleton />
            </section>
            <section className="rounded-lg border border-border bg-background">
              <LoadingSkeleton rows={5} />
            </section>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <TrendChart
              buckets={analyticsBuckets}
              emptyLabel={t('charts.no_data')}
              series={[
                {
                  className: 'bg-dynamic-blue',
                  getValue: (bucket) => bucket.requests,
                  label: t('charts.requests'),
                },
                {
                  className: 'bg-dynamic-red',
                  getValue: (bucket) => bucket.serverErrors,
                  label: t('charts.server_errors'),
                },
              ]}
              title={t('charts.request_trend')}
            />
            <HorizontalBars
              emptyLabel={t('charts.no_data')}
              rows={statusRows}
              title={t('charts.status_distribution')}
            />
            <HorizontalBars
              emptyLabel={t('charts.no_data')}
              rows={topRouteRows}
              title={t('charts.route_pressure')}
            />
            <HorizontalBars
              emptyLabel={t('charts.no_data')}
              rows={sourceRows}
              title={t('charts.source_mix')}
            />
          </div>
        ))}

      {mode === 'logs' && (
        <ObservabilityLogsPanel
          emptyLabel={t('empty.logs')}
          endLabel={infiniteLabels.end}
          facets={logFacets}
          filters={logPanelFilters}
          groups={logs}
          hasMore={logsQuery.hasNextPage}
          isFetchingMore={logsQuery.isFetchingNextPage}
          isLoading={logsQuery.isLoading}
          isPaused={logsPaused}
          loaded={logs.length}
          loadingLabel={infiniteLabels.loading}
          moreLabel={infiniteLabels.more}
          onFilterChange={setLogPanelFilters}
          onLoadMore={() => void logsQuery.fetchNextPage()}
          onRefresh={() => void logsQuery.refetch()}
          onTogglePaused={() => setLogsPaused((current) => !current)}
          total={logsTotal}
        />
      )}

      {mode === 'requests' && (
        <section className="rounded-lg border border-border bg-background">
          <div className="flex flex-col gap-3 border-border border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-sm">
                {t('requests.frozen_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('requests.frozen_meta', {
                  time: formatDateTime(requestFreezeUntil),
                })}
              </p>
            </div>
            {newRequestCount > 0 ? (
              <Button
                onClick={() => setRequestFreezeUntil(Date.now())}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('requests.show_new', {
                  count: formatNumber(newRequestCount),
                })}
              </Button>
            ) : (
              <Badge className="rounded-full" variant="outline">
                {t('requests.no_new')}
              </Badge>
            )}
          </div>
          {requestsQuery.isLoading ? (
            <LoadingSkeleton rows={8} />
          ) : (
            <VirtualizedList
              empty={t('empty.requests')}
              estimateRowHeight={96}
              hasMore={requestsQuery.hasNextPage}
              isFetchingMore={requestsQuery.isFetchingNextPage}
              items={requests}
              onEndReached={() => void requestsQuery.fetchNextPage()}
              renderRow={(request) => (
                <RequestRow key={request.id} request={request} />
              )}
            />
          )}
          <InfiniteFooter
            endLabel={infiniteLabels.end}
            hasMore={requestsQuery.hasNextPage}
            isFetchingMore={requestsQuery.isFetchingNextPage}
            loaded={requests.length}
            loadingLabel={infiniteLabels.loading}
            moreLabel={infiniteLabels.more}
            total={requestsTotal}
          />
        </section>
      )}

      {mode === 'deployments' && (
        <ObservabilityDeploymentsPanel
          deployments={deployments}
          emptyLabel={t('empty.deployments')}
          hasMore={deploymentsQuery.hasNextPage}
          isFetchingMore={deploymentsQuery.isFetchingNextPage}
          isLoading={deploymentsQuery.isLoading}
          loaded={deployments.length}
          onLoadMore={() => void deploymentsQuery.fetchNextPage()}
          snapshot={watcherQuery.data ?? null}
          total={deploymentsTotal}
        />
      )}

      {mode === 'cron' && (
        <div className="space-y-4">
          <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
            <MetricCard
              label={t('cron.summary.runner')}
              meta={t('cron.summary.runner_meta')}
              value={cronSnapshot?.status ?? '-'}
            />
            <MetricCard
              label={t('cron.summary.enabled_jobs')}
              meta={`${formatNumber(
                cronSnapshot?.overview.enabledJobs
              )} / ${formatNumber(cronSnapshot?.overview.totalJobs)}`}
              value={formatNumber(cronSnapshot?.overview.enabledJobs)}
            />
            <MetricCard
              label={t('cron.summary.queue')}
              meta={`${t('cron.summary.processing')}: ${formatNumber(
                cronSnapshot?.overview.processingRuns
              )}`}
              value={formatNumber(cronSnapshot?.overview.queuedRuns)}
            />
            <MetricCard
              label={t('cron.summary.next_run')}
              meta={t(
                cronSnapshot?.status && cronSnapshot.status !== 'live'
                  ? 'cron.summary.next_run_stale_meta'
                  : 'cron.summary.next_run_meta'
              )}
              value={formatTime(cronSnapshot?.nextRunAt)}
            />
          </section>

          {cronDiagnostics.length > 0 ? (
            <section
              className="rounded-lg border border-dynamic-orange/35 bg-dynamic-orange/5"
              data-testid="cron-diagnostics"
            >
              <div className="border-dynamic-orange/20 border-b px-4 py-3">
                <p className="font-medium text-sm">
                  {t('cron.diagnostics.title')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('cron.diagnostics.description')}
                </p>
              </div>
              <div className="divide-y divide-dynamic-orange/15">
                {cronDiagnostics.map((diagnostic, index) => (
                  <div
                    className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[auto_minmax(0,1fr)]"
                    key={`${diagnostic.code}-${diagnostic.jobId ?? index}`}
                  >
                    <ToneBadge
                      tone={getCronDiagnosticTone(diagnostic.severity)}
                    >
                      {t(`cron.diagnostics.severity.${diagnostic.severity}`)}
                    </ToneBadge>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t(`cron.diagnostics.messages.${diagnostic.code}`, {
                          count: diagnostic.count ?? 0,
                          jobId: diagnostic.jobId ?? '-',
                        })}
                      </p>
                      {diagnostic.detail ? (
                        <p className="mt-1 break-words text-muted-foreground text-xs">
                          {t('cron.diagnostics.detail')}: {diagnostic.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section
            className={cn(
              'rounded-lg border bg-background',
              focus === 'cron-runner'
                ? 'border-dynamic-blue/35 bg-dynamic-blue/5'
                : 'border-border'
            )}
            id="cron-runner"
          >
            <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">
                    {cronT('runner_recovery.title')}
                  </p>
                  <ToneBadge tone={getCronRunnerTone(cronSnapshot?.status)}>
                    {cronT(
                      `runner_status.${cronSnapshot?.status ?? 'missing'}`
                    )}
                  </ToneBadge>
                  {cronSnapshot?.runnerRecoveryRequest ? (
                    <ToneBadge tone="amber">
                      {cronT('runner_recovery.pending')}
                    </ToneBadge>
                  ) : null}
                  {cronSnapshot?.recovery.watcherStatus ? (
                    <ToneBadge
                      tone={getCronRunnerTone(
                        cronSnapshot.recovery.watcherStatus
                      )}
                    >
                      {cronT('runner_recovery.watcher')}:{' '}
                      {cronT(
                        `runner_status.${cronSnapshot.recovery.watcherStatus}`
                      )}
                    </ToneBadge>
                  ) : null}
                  {cronSnapshot?.recovery.directControl.configured ? (
                    <ToneBadge
                      tone={getCronRunnerTone(
                        cronSnapshot.recovery.directControl.status
                      )}
                    >
                      {cronT('runner_recovery.direct_control')}:{' '}
                      {cronT(
                        `runner_status.${cronSnapshot.recovery.directControl.status}`
                      )}
                    </ToneBadge>
                  ) : null}
                  {cronWatchdog ? (
                    <ToneBadge tone={getCronWatchdogTone(cronWatchdog.status)}>
                      {cronT('runner_recovery.watchdog')}:{' '}
                      {cronT(`watchdog_status.${cronWatchdog.status}`)}
                    </ToneBadge>
                  ) : null}
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-5">
                  {cronT('runner_recovery.description')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <ToneBadge tone="muted">
                    {cronT('runner_recovery.last_heartbeat')}:{' '}
                    {formatTime(cronSnapshot?.updatedAt)}
                  </ToneBadge>
                  {cronSnapshot?.runnerRecoveryRequest ? (
                    <ToneBadge tone="blue">
                      {cronT('runner_recovery.requested')}:{' '}
                      {formatTime(
                        Date.parse(
                          cronSnapshot.runnerRecoveryRequest.requestedAt
                        )
                      )}
                    </ToneBadge>
                  ) : null}
                  {cronWatchdog?.lastCheckedAt ? (
                    <ToneBadge tone="muted">
                      {cronT('runner_recovery.watchdog_checked')}:{' '}
                      {formatTime(cronWatchdog.lastCheckedAt)}
                    </ToneBadge>
                  ) : null}
                </div>
                {cronSnapshot?.runnerRecoveryRequest?.lastError ? (
                  <p className="mt-3 rounded-md border border-dynamic-red/25 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
                    {cronT('runner_recovery.last_error')}:{' '}
                    {cronSnapshot.runnerRecoveryRequest.lastError}
                  </p>
                ) : cronWatchdog?.lastError ? (
                  <p className="mt-3 rounded-md border border-dynamic-red/25 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
                    {cronT('runner_recovery.watchdog_error')}:{' '}
                    {cronWatchdog.lastError}
                  </p>
                ) : cronWatchdog?.lastReason &&
                  cronWatchdog.status !== 'healthy' ? (
                  <p className="mt-3 rounded-md border border-dynamic-yellow/25 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-xs">
                    {cronT('runner_recovery.watchdog_reason')}:{' '}
                    {cronWatchdog.lastReason}
                  </p>
                ) : cronSnapshot?.recovery.blockedReason ? (
                  <p className="mt-3 rounded-md border border-dynamic-red/25 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
                    {cronSnapshot.recovery.blockedReason}
                  </p>
                ) : cronSnapshot?.runnerRecoveryRequest ? (
                  <p className="mt-3 rounded-md border border-dynamic-yellow/25 bg-dynamic-yellow/10 px-3 py-2 text-dynamic-yellow text-xs">
                    {cronT('runner_recovery.watcher_waiting')}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  disabled={
                    cronRunnerRecoveryMutation.isPending ||
                    !cronSnapshot ||
                    cronSnapshot.recovery.canRequest === false
                  }
                  onClick={() => cronRunnerRecoveryMutation.mutate('ensure')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Power className="mr-2 h-4 w-4" />
                  {cronRunnerRecoveryMutation.isPending &&
                  cronRunnerRecoveryMutation.variables === 'ensure'
                    ? cronT('runner_recovery.ensure_pending')
                    : cronT('runner_recovery.ensure_action')}
                </Button>
                <Button
                  disabled={
                    cronRunnerRecoveryMutation.isPending ||
                    !cronSnapshot ||
                    cronSnapshot.recovery.canRequest === false
                  }
                  onClick={() => cronRunnerRecoveryMutation.mutate('restart')}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {cronRunnerRecoveryMutation.isPending &&
                  cronRunnerRecoveryMutation.variables === 'restart'
                    ? cronT('runner_recovery.restart_pending')
                    : cronT('runner_recovery.restart_action')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
              <div>
                <p className="font-medium text-sm">{cronT('jobs_title')}</p>
                <p className="text-muted-foreground text-xs">
                  {cronT('jobs_description')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Power className="h-4 w-4 text-muted-foreground" />
                <Switch
                  checked={cronSnapshot?.enabled ?? false}
                  disabled={cronControlMutation.isPending || !cronSnapshot}
                  onCheckedChange={(enabled) =>
                    cronControlMutation.mutate({ enabled })
                  }
                />
              </div>
            </div>
            {cronSnapshotQuery.isLoading ? (
              <LoadingSkeleton rows={5} />
            ) : (
              (cronSnapshot?.jobs ?? []).map((job) => (
                <div
                  className="grid gap-3 border-border/50 border-b px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_auto]"
                  key={job.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono">{job.id}</span>
                      <ToneBadge tone={job.enabled ? 'green' : 'muted'}>
                        {job.enabled
                          ? cronT('states.enabled')
                          : cronT('states.disabled')}
                      </ToneBadge>
                      {job.controlEnabled != null ? (
                        <ToneBadge tone="blue">
                          {t('cron.runtime_override')}
                        </ToneBadge>
                      ) : null}
                      {cronSnapshot?.enabled === false ? (
                        <ToneBadge tone="orange">
                          {t('cron.global_paused')}
                        </ToneBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {job.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <ToneBadge tone="blue">
                        {t('cron.schedule')}:{' '}
                        {describeCronSchedule(job.schedule, cronScheduleLabels)}
                      </ToneBadge>
                      <ToneBadge tone="muted">{job.schedule}</ToneBadge>
                      <ToneBadge tone="muted">{job.path}</ToneBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <ToneBadge tone="amber">
                        {cronT('last_run')}:{' '}
                        {formatTime(
                          job.lastExecution?.startedAt ?? job.lastScheduledAt
                        )}
                      </ToneBadge>
                      <ToneBadge tone="green">
                        {cronSnapshot?.status && cronSnapshot.status !== 'live'
                          ? cronT('next_run_scheduled_estimate')
                          : cronT('next_run')}
                        : {formatTime(job.nextRunAt)}
                      </ToneBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <ToneBadge
                        tone={getCronRunTone(job.lastExecution?.status)}
                      >
                        {t('cron.last_status')}:{' '}
                        {job.lastExecution?.status ?? '-'}
                      </ToneBadge>
                      <ToneBadge tone="blue">
                        {t('cron.last_duration')}:{' '}
                        {formatDuration(job.lastExecution?.durationMs)}
                      </ToneBadge>
                      <ToneBadge tone={job.failureStreak > 0 ? 'red' : 'green'}>
                        {t('cron.failure_streak')}:{' '}
                        {formatNumber(job.failureStreak)}
                      </ToneBadge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <Switch
                      checked={job.enabled}
                      disabled={
                        cronControlMutation.isPending ||
                        cronSnapshot?.enabled === false
                      }
                      onCheckedChange={(enabled) =>
                        cronControlMutation.mutate({ enabled, jobId: job.id })
                      }
                    />
                    <Button
                      disabled={
                        runCronMutation.isPending ||
                        !job.enabled ||
                        cronSnapshot?.enabled === false
                      }
                      onClick={() => runCronMutation.mutate(job.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {cronT('actions.run_now')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="rounded-lg border border-border bg-background">
            <div className="border-border border-b px-4 py-3">
              <p className="font-medium text-sm">{cronT('executions_title')}</p>
              <p className="text-muted-foreground text-xs">
                {cronT('executions_description')}
              </p>
            </div>
            {cronExecutionsQuery.isLoading ? (
              <LoadingSkeleton rows={8} />
            ) : (
              <VirtualizedList
                empty={t('empty.cron_executions')}
                estimateRowHeight={92}
                hasMore={cronExecutionsQuery.hasNextPage}
                isFetchingMore={cronExecutionsQuery.isFetchingNextPage}
                items={cronExecutions}
                onEndReached={() => void cronExecutionsQuery.fetchNextPage()}
                renderRow={(run) => (
                  <button
                    className="grid h-full w-full gap-2 border-border/50 border-b px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.025]"
                    key={run.id}
                    onClick={() => setSelectedExecution(run)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-mono">{run.jobId}</span>
                      <ToneBadge tone={getCronRunTone(run.status)}>
                        {run.status}
                      </ToneBadge>
                    </div>
                    <span className="truncate text-muted-foreground text-xs">
                      {run.path}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <ToneBadge
                        tone={run.source === 'manual' ? 'blue' : 'amber'}
                      >
                        {run.source}
                      </ToneBadge>
                      <span className="text-muted-foreground">
                        {formatTime(run.startedAt)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </span>
                    </div>
                  </button>
                )}
              />
            )}
            <InfiniteFooter
              endLabel={infiniteLabels.end}
              hasMore={cronExecutionsQuery.hasNextPage}
              isFetchingMore={cronExecutionsQuery.isFetchingNextPage}
              loaded={cronExecutions.length}
              loadingLabel={infiniteLabels.loading}
              moreLabel={infiniteLabels.more}
              total={cronExecutionsTotal}
            />
          </section>
        </div>
      )}

      {mode === 'analytics' && (
        <div className="space-y-4">
          {analyticsQuery.isLoading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-lg border border-border bg-background">
                <ChartSkeleton />
              </section>
              <section className="rounded-lg border border-border bg-background">
                <LoadingSkeleton rows={5} />
              </section>
            </div>
          ) : (
            <>
              <TrendChart
                buckets={analyticsBuckets}
                emptyLabel={t('charts.no_data')}
                series={[
                  {
                    className: 'bg-dynamic-blue',
                    getValue: (bucket) => bucket.requests,
                    label: t('charts.requests'),
                  },
                  {
                    className: 'bg-dynamic-red',
                    getValue: (bucket) => bucket.serverErrors,
                    label: t('charts.server_errors'),
                  },
                  {
                    className: 'bg-dynamic-orange',
                    getValue: (bucket) => bucket.cronRuns,
                    label: t('charts.cron_runs'),
                  },
                ]}
                title={t('charts.request_trend')}
              />
              <div className="grid gap-4 xl:grid-cols-3">
                <HorizontalBars
                  emptyLabel={t('charts.no_data')}
                  rows={statusRows}
                  title={t('charts.status_distribution')}
                />
                <HorizontalBars
                  emptyLabel={t('charts.no_data')}
                  rows={topRouteRows}
                  title={t('charts.route_pressure')}
                />
                <HorizontalBars
                  emptyLabel={t('charts.no_data')}
                  rows={cronJobRows}
                  title={t('charts.cron_hotspots')}
                />
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'observability' && (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              [t('signals.server_errors'), overview?.serverErrorCount, 'red'],
              [
                t('signals.slow_requests'),
                overview?.slowRequestCount,
                'orange',
              ],
              [
                t('signals.cron_failure_rate'),
                overview?.cronFailureRate,
                'amber',
              ],
              [
                t('signals.active_sources'),
                Object.keys(overview?.sourceCounts ?? {}).length,
                'green',
              ],
            ].map(([label, value, tone]) => (
              <div
                className={cn(
                  'rounded-lg border bg-background p-4',
                  toneClasses[tone as Tone].soft
                )}
                key={label}
              >
                <FileText
                  className={cn('mb-4 h-4 w-4', toneClasses[tone as Tone].text)}
                />
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-2 font-semibold text-2xl">
                  {formatNumber(value as number)}
                </p>
              </div>
            ))}
          </section>
          <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
            <MetricCard
              label={t('signals.error_rate')}
              meta={t('signals.error_rate_meta')}
              value={`${formatNumber(overview?.errorRate)}%`}
            />
            <MetricCard
              label={t('signals.p95_latency')}
              meta={t('signals.p95_latency_meta')}
              value={formatLatencyMs(overview?.p95DurationMs)}
            />
            <MetricCard
              label={t('signals.last_event')}
              meta={t('signals.last_event_meta')}
              value={formatTime(overview?.lastEventAt)}
            />
            <MetricCard
              label={t('signals.routes')}
              meta={t('signals.routes_meta')}
              value={formatNumber(overview?.topRoutes.length)}
            />
          </section>
          {analyticsQuery.isLoading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-lg border border-border bg-background">
                <LoadingSkeleton rows={6} />
              </section>
              <section className="rounded-lg border border-border bg-background">
                <ChartSkeleton />
              </section>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <HorizontalBars
                emptyLabel={t('charts.no_data')}
                rows={slowRouteRows}
                title={t('charts.latency_pressure')}
              />
              <HorizontalBars
                emptyLabel={t('charts.no_data')}
                rows={cronJobRows}
                title={t('charts.cron_hotspots')}
              />
              <HorizontalBars
                emptyLabel={t('charts.no_data')}
                rows={sourceRows}
                title={t('charts.source_mix')}
              />
              <HorizontalBars
                emptyLabel={t('charts.no_data')}
                rows={topRouteRows}
                title={t('charts.route_pressure')}
              />
              <TrendChart
                buckets={analyticsBuckets}
                emptyLabel={t('charts.no_data')}
                series={[
                  {
                    className: 'bg-dynamic-red',
                    getValue: (bucket) => bucket.errors,
                    label: t('charts.errors'),
                  },
                  {
                    className: 'bg-dynamic-orange',
                    getValue: (bucket) => bucket.cronRuns,
                    label: t('charts.cron_runs'),
                  },
                ]}
                title={t('charts.incident_trend')}
              />
              <section className="rounded-lg border border-border bg-background">
                <div className="border-border border-b px-4 py-3 font-medium text-sm">
                  {t('recent_errors')}
                </div>
                {(overview?.recentErrors ?? []).length > 0 ? (
                  (overview?.recentErrors ?? []).map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))
                ) : (
                  <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {t('charts.no_data')}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {mode === 'resources' && (
        <ObservabilityResourcesPanel
          data={resourcesQuery.data}
          isLoading={resourcesQuery.isLoading}
          onTimeframeHoursChange={(value) => void setTimeframeHours(value)}
          scopedContainers={scopedContainers}
          timeframeHours={timeframeHours}
        />
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) setSelectedExecution(null);
        }}
        open={Boolean(selectedExecution)}
      >
        <DialogContent className="max-w-4xl">
          {selectedExecution ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedExecution.jobId}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  [cronT('detail.status'), selectedExecution.status],
                  [
                    cronT('detail.started'),
                    formatTime(selectedExecution.startedAt),
                  ],
                  [
                    cronT('detail.duration'),
                    formatDuration(selectedExecution.durationMs),
                  ],
                  [
                    cronT('detail.http_status'),
                    selectedExecution.httpStatus?.toString() ?? '-',
                  ],
                ].map(([label, value]) => (
                  <div
                    className="rounded-lg border border-border/60 bg-muted/20 p-3"
                    key={label}
                  >
                    <p className="text-muted-foreground text-xs uppercase">
                      {label}
                    </p>
                    <p className="mt-2 font-medium text-sm">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 font-medium text-sm">
                    {cronT('detail.response')}
                  </p>
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    {selectedExecution.error ||
                      selectedExecution.response ||
                      cronT('detail.empty_response')}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 font-medium text-sm">
                    {cronT('detail.console_logs')}
                  </p>
                  <div className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                    {selectedExecution.consoleLogs.length > 0 ? (
                      selectedExecution.consoleLogs.map((log) => (
                        <div
                          className="border-border/50 border-b py-2 last:border-b-0"
                          key={`${log.time}-${log.message}`}
                        >
                          <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                            <span>{formatTime(log.time)}</span>
                            <span>{log.level}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
                            {log.message}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {cronT('detail.empty_console_logs')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
