'use client';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface HourlyChartProps {
  clicksByHour: Array<{ hour: number; clicks: number }>;
}

const chartConfig = {
  clicks: {
    label: 'Clicks',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export function HourlyChart({ clicksByHour }: HourlyChartProps) {
  const t = useTranslations();

  if (clicksByHour.length === 0) {
    return (
      <div className="space-y-2 text-center">
        <div className="mx-auto h-12 w-12 text-muted-foreground/50">
          <svg
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-labelledby="clock-icon-title"
          >
            <title id="clock-icon-title">
              {t('link-shortener.analytics.hourly_chart_title')}
            </title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-muted-foreground">
          {t('link-shortener.analytics.no_hourly_data')}
        </p>
      </div>
    );
  }

  const chartData = clicksByHour.map((hour) => ({
    hour: hour.hour.toString().padStart(2, '0'),
    clicks: hour.clicks,
    label: `${hour.hour.toString().padStart(2, '0')}:00`,
  }));

  return (
    <div className="space-y-4">
      {/* Chart Container */}
      <div className="relative">
        <ChartContainer config={chartConfig} className="h-64 w-full">
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
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              interval={3}
            />
            <YAxis tickLine={false} axisLine={false} width={30} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `${label}:00`}
                  formatter={(value) => [
                    value,
                    ' ',
                    t('link-shortener.analytics.clicks_label'),
                  ]}
                />
              }
            />
            <Bar
              dataKey="clicks"
              fill="var(--color-clicks)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* Peak Hours Indicator */}
        {(() => {
          const maxClicks = Math.max(...clicksByHour.map((h) => h.clicks));
          const peakHour = clicksByHour.find((h) => h.clicks === maxClicks);
          if (peakHour && maxClicks > 0) {
            return (
              <div className="absolute top-2 right-2 rounded-lg bg-dynamic-blue/10 px-2 py-1 backdrop-blur-sm">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-dynamic-blue"></div>
                  <span className="font-medium text-dynamic-blue text-xs">
                    {t('link-shortener.analytics.peak_hour')}:{' '}
                    {peakHour.hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              </div>
            );
          }
          return null;
        })()}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(() => {
          const totalClicks = clicksByHour.reduce(
            (sum, h) => sum + h.clicks,
            0
          );
          const peakClicks = Math.max(...clicksByHour.map((h) => h.clicks));
          const activeHours = clicksByHour.filter((h) => h.clicks > 0).length;
          const avgClicks =
            totalClicks > 0
              ? Math.round(totalClicks / Math.max(1, activeHours))
              : 0;

          return (
            <>
              <div className="rounded-lg bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-3 text-center">
                <div className="font-bold text-dynamic-blue text-lg">
                  {peakClicks}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('link-shortener.analytics.peak_hour')}
                </div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10 p-3 text-center">
                <div className="font-bold text-dynamic-green text-lg">
                  {avgClicks}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('link-shortener.analytics.avg_per_hour')}
                </div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10 p-3 text-center">
                <div className="font-bold text-dynamic-orange text-lg">
                  {activeHours}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('link-shortener.analytics.active_hours')}
                </div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-dynamic-purple/5 to-dynamic-purple/10 p-3 text-center">
                <div className="font-bold text-dynamic-purple text-lg">
                  {totalClicks}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('link-shortener.analytics.total_clicks_summary')}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
