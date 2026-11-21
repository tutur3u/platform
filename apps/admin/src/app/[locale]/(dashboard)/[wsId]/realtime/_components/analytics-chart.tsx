'use client';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface RealtimeAnalyticsChartProps {
  data: Array<{ label: string; count: number }>;
  metric: 'requests' | 'users';
  isLoading?: boolean;
}

export function RealtimeAnalyticsChart({
  data,
  metric,
  isLoading,
}: RealtimeAnalyticsChartProps) {
  const t = useTranslations('realtime-analytics');

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-dynamic-blue border-t-transparent" />
          <p className="mt-4 text-muted-foreground text-sm">
            {t('chart.loading')}
          </p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 text-muted-foreground/50">
            <svg
              className="h-full w-full"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-labelledby="chart-icon-title"
            >
              <title id="chart-icon-title">{t('chart.hourly_activity')}</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="font-medium text-foreground">{t('chart.no_data')}</p>
          <p className="text-muted-foreground text-sm">
            {t('chart.no_data_description')}
          </p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    count: {
      label:
        metric === 'requests'
          ? t('chart.requests_label')
          : t('chart.users_label'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  const chartData = data.map((item) => ({
    label: item.label,
    count: item.count,
  }));

  // Calculate stats
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);
  const peakCount = Math.max(...data.map((item) => item.count));
  const peakLabel = data.find((item) => item.count === peakCount)?.label;
  const avgCount = totalCount > 0 ? Math.round(totalCount / data.length) : 0;

  return (
    <div className="space-y-4">
      {/* Chart Container */}
      <div className="relative">
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <BarChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => label}
                  formatter={(value) => [
                    value,
                    ' ',
                    metric === 'requests'
                      ? t('chart.requests_label')
                      : t('chart.users_label'),
                  ]}
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* Peak Period Indicator */}
        {peakLabel && peakCount > 0 && (
          <div className="absolute top-2 right-2 rounded-lg bg-dynamic-blue/10 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
              <span className="font-medium text-dynamic-blue text-xs">
                {t('stats.peak_hour')}: {peakLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-linear-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-3 text-center">
          <div className="font-bold text-dynamic-blue text-lg">{peakCount}</div>
          <div className="text-muted-foreground text-xs">
            {t('stats.peak_hour')}
          </div>
        </div>
        <div className="rounded-lg bg-linear-to-br from-dynamic-green/5 to-dynamic-green/10 p-3 text-center">
          <div className="font-bold text-dynamic-green text-lg">{avgCount}</div>
          <div className="text-muted-foreground text-xs">
            {t('stats.avg_per_hour')}
          </div>
        </div>
        <div className="rounded-lg bg-linear-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-3 text-center">
          <div className="font-bold text-dynamic-purple text-lg">
            {totalCount}
          </div>
          <div className="text-muted-foreground text-xs">
            {t('stats.total')}
          </div>
        </div>
      </div>
    </div>
  );
}
