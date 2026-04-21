'use client';

import type {
  BlueGreenMonitoringPeriodMetric,
  BlueGreenMonitoringSnapshot,
} from '@tuturuuu/internal-api/infrastructure';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatBytes,
  formatCompactNumber,
  formatDuration,
  formatNumber,
  formatPercent,
} from './formatters';

export function DeploymentStoryChart({
  deployments,
}: {
  deployments: BlueGreenMonitoringSnapshot['deployments'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const chartData = useMemo(
    () =>
      deployments
        .slice(0, 5)
        .reverse()
        .map((deployment, index) => ({
          buildMinutes:
            deployment.buildDurationMs != null
              ? deployment.buildDurationMs / 60_000
              : 0,
          commit:
            deployment.commitShortHash ??
            `${deployment.activeColor?.slice(0, 1) ?? 'n'}${index + 1}`,
          requests: deployment.requestCount ?? 0,
          status: deployment.status ?? 'unknown',
        })),
    [deployments]
  );

  const chartConfig = {
    buildMinutes: {
      color: 'var(--chart-2)',
      label: t('chart.build_minutes'),
    },
    requests: {
      color: 'var(--chart-1)',
      label: t('chart.requests'),
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return <MonitoringChartEmptyState label={t('empty.deployments')} />;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <ComposedChart accessibilityLayer data={chartData} barGap={16}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="commit"
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          yAxisId="build"
          tickFormatter={(value) => `${value}m`}
          tickLine={false}
          width={44}
        />
        <YAxis
          axisLine={false}
          orientation="right"
          tickFormatter={(value) => formatCompactNumber(Number(value))}
          tickLine={false}
          width={44}
          yAxisId="requests"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                name === 'buildMinutes'
                  ? formatDuration(Number(value) * 60_000)
                  : formatCompactNumber(Number(value)),
                ' ',
                name === 'buildMinutes'
                  ? t('chart.build_minutes')
                  : t('chart.requests'),
              ]}
            />
          }
        />
        <Bar
          dataKey="buildMinutes"
          fill="var(--color-buildMinutes)"
          radius={[10, 10, 2, 2]}
          yAxisId="build"
        />
        <Line
          dataKey="requests"
          dot={false}
          stroke="var(--color-requests)"
          strokeWidth={2.5}
          type="monotone"
          yAxisId="requests"
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export function RequestVelocityChart({
  deployments,
}: {
  deployments: BlueGreenMonitoringSnapshot['deployments'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const chartData = useMemo(
    () =>
      deployments
        .filter((deployment) => deployment.status === 'successful')
        .slice(0, 5)
        .reverse()
        .map((deployment, index) => ({
          avgRpm: deployment.averageRequestsPerMinute ?? 0,
          commit:
            deployment.commitShortHash ??
            `${deployment.activeColor?.slice(0, 1) ?? 'n'}${index + 1}`,
          peakRpm: deployment.peakRequestsPerMinute ?? 0,
        })),
    [deployments]
  );

  const chartConfig = {
    avgRpm: {
      color: 'var(--chart-1)',
      label: t('chart.average_rpm'),
    },
    peakRpm: {
      color: 'var(--chart-4)',
      label: t('chart.peak_rpm'),
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return <MonitoringChartEmptyState label={t('empty.velocity')} />;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <LineChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="commit"
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} tickLine={false} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                formatNumber(Number(value)),
                ' ',
                name === 'peakRpm'
                  ? t('chart.peak_rpm')
                  : t('chart.average_rpm'),
              ]}
            />
          }
        />
        <Line
          dataKey="avgRpm"
          dot={false}
          stroke="var(--color-avgRpm)"
          strokeWidth={3}
          type="monotone"
        />
        <Line
          dataKey="peakRpm"
          dot={false}
          stroke="var(--color-peakRpm)"
          strokeDasharray="5 5"
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  );
}

export function ContainerResourceChart({
  dockerResources,
}: {
  dockerResources: BlueGreenMonitoringSnapshot['dockerResources'];
}) {
  const t = useTranslations('blue-green-monitoring');
  const chartData = useMemo(
    () =>
      dockerResources.containers.map((container) => ({
        cpuPercent: container.cpuPercent ?? 0,
        label: container.label.toUpperCase(),
        memoryMiB:
          container.memoryBytes != null
            ? container.memoryBytes / (1024 * 1024)
            : 0,
      })),
    [dockerResources.containers]
  );

  const chartConfig = {
    cpuPercent: {
      color: 'var(--chart-3)',
      label: t('chart.cpu'),
    },
    memoryMiB: {
      color: 'var(--chart-5)',
      label: t('chart.memory'),
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return <MonitoringChartEmptyState label={t('empty.containers')} />;
  }

  return (
    <div className="space-y-4">
      <ChartContainer config={chartConfig} className="h-[220px] w-full">
        <ComposedChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value) => formatPercent(Number(value))}
            tickLine={false}
            width={44}
            yAxisId="cpu"
          />
          <YAxis
            axisLine={false}
            orientation="right"
            tickFormatter={(value) => `${Math.round(Number(value))} MiB`}
            tickLine={false}
            width={54}
            yAxisId="memory"
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [
                  name === 'memoryMiB'
                    ? formatBytes(Number(value) * 1024 * 1024)
                    : formatPercent(Number(value)),
                  ' ',
                  name === 'memoryMiB' ? t('chart.memory') : t('chart.cpu'),
                ]}
              />
            }
          />
          <Bar
            dataKey="cpuPercent"
            fill="var(--color-cpuPercent)"
            radius={[10, 10, 2, 2]}
            yAxisId="cpu"
          />
          <Line
            dataKey="memoryMiB"
            dot={false}
            stroke="var(--color-memoryMiB)"
            strokeDasharray="4 4"
            strokeWidth={2.5}
            type="monotone"
            yAxisId="memory"
          />
        </ComposedChart>
      </ChartContainer>

      <div className="grid gap-3 sm:grid-cols-3">
        {dockerResources.containers.map((container) => (
          <div
            key={container.containerId}
            className="rounded-3xl border border-border/60 bg-background/80 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm uppercase tracking-[0.2em]">
                {container.label}
              </p>
              <span className="text-muted-foreground text-xs">
                {formatPercent(container.cpuPercent)}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('chart.memory')}
                </span>
                <span>{formatBytes(container.memoryBytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('chart.rx')}</span>
                <span>{formatBytes(container.rxBytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('chart.tx')}</span>
                <span>{formatBytes(container.txBytes)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeriodTrendChart({
  metrics,
}: {
  metrics: BlueGreenMonitoringPeriodMetric[];
}) {
  const t = useTranslations('blue-green-monitoring');
  const chartData = useMemo(
    () =>
      metrics
        .slice(0, 10)
        .reverse()
        .map((metric) => ({
          bucket: metric.bucketLabel,
          peakRpm: metric.peakRequestsPerMinute,
          requests: metric.requestCount,
        })),
    [metrics]
  );

  const chartConfig = {
    peakRpm: {
      color: 'var(--chart-4)',
      label: t('chart.peak_rpm'),
    },
    requests: {
      color: 'var(--chart-1)',
      label: t('chart.requests'),
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return <MonitoringChartEmptyState label={t('empty.velocity')} />;
  }

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <ComposedChart accessibilityLayer data={chartData} barGap={18}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="bucket"
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
          tickLine={false}
          width={44}
          yAxisId="requests"
        />
        <YAxis
          axisLine={false}
          orientation="right"
          tickLine={false}
          width={44}
          yAxisId="rpm"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                formatNumber(Number(value)),
                ' ',
                name === 'peakRpm' ? t('chart.peak_rpm') : t('chart.requests'),
              ]}
            />
          }
        />
        <Bar
          dataKey="requests"
          fill="var(--color-requests)"
          radius={[10, 10, 2, 2]}
          yAxisId="requests"
        />
        <Line
          dataKey="peakRpm"
          dot={false}
          stroke="var(--color-peakRpm)"
          strokeWidth={2.5}
          type="monotone"
          yAxisId="rpm"
        />
      </ComposedChart>
    </ChartContainer>
  );
}

function MonitoringChartEmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-3xl border border-border/70 border-dashed bg-background/40">
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}
