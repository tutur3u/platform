'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { BarChart3 } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface DailyActivityChartProps {
  clicksByDay: Array<{ date: string; clicks: number }>;
}

const chartConfig = {
  clicks: {
    label: 'Clicks',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export function DailyActivityChart({ clicksByDay }: DailyActivityChartProps) {
  const t = useTranslations();

  if (clicksByDay.length === 0) {
    return (
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl xl:col-span-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-dynamic-blue/10 p-2">
              <BarChart3 className="h-5 w-5 text-dynamic-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {t('link-shortener.analytics.clicks_over_time')}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t('link-shortener.analytics.last_30_days_activity')}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-2 py-8 text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {t('link-shortener.analytics.no_click_data')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = clicksByDay
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((day) => ({
      date: day.date,
      clicks: day.clicks,
      formattedDate: new Date(day.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }));

  const totalClicks = clicksByDay.reduce((sum, day) => sum + day.clicks, 0);
  const avgClicks = Math.round(totalClicks / clicksByDay.length);
  const maxClicks = Math.max(...clicksByDay.map((d) => d.clicks));
  const maxClicksDay = clicksByDay.find((d) => d.clicks === maxClicks);

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl xl:col-span-2">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-dynamic-blue/10 p-2">
            <BarChart3 className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">
              {t('link-shortener.analytics.clicks_over_time')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('link-shortener.analytics.last_30_days_activity')}
            </p>
          </div>
          {/* Summary Stats in Header */}
          <div className="hidden items-center gap-6 sm:flex">
            <div className="text-center">
              <div className="font-bold text-dynamic-blue text-lg">
                {totalClicks.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-xs">Total</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-dynamic-green text-lg">
                {avgClicks}
              </div>
              <div className="text-muted-foreground text-xs">Avg/Day</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-dynamic-orange text-lg">
                {maxClicks}
              </div>
              <div className="text-muted-foreground text-xs">Peak</div>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="space-y-4">
          {/* Chart */}
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart
              data={chartData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <defs>
                <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-clicks)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-clicks)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="formattedDate"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={40}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label, payload) => {
                      if (payload?.[0]) {
                        const date = payload[0].payload.date as string;
                        if (!date) return label;
                        return new Date(date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        });
                      }
                      return label;
                    }}
                    formatter={(value) => [
                      value,
                      ' ',
                      t('link-shortener.analytics.clicks_label'),
                    ]}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="clicks"
                stroke="var(--color-clicks)"
                strokeWidth={2}
                fill="url(#clicksGradient)"
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </AreaChart>
          </ChartContainer>

          {/* Mobile Summary Stats */}
          <div className="grid grid-cols-3 gap-4 sm:hidden">
            <div className="rounded-lg bg-gradient-to-br from-dynamic-blue/5 to-dynamic-blue/10 p-3 text-center">
              <div className="font-bold text-dynamic-blue text-lg">
                {totalClicks.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-xs">Total Clicks</div>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-dynamic-green/5 to-dynamic-green/10 p-3 text-center">
              <div className="font-bold text-dynamic-green text-lg">
                {avgClicks}
              </div>
              <div className="text-muted-foreground text-xs">Avg/Day</div>
            </div>
            <div className="rounded-lg bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10 p-3 text-center">
              <div className="font-bold text-dynamic-orange text-lg">
                {maxClicks}
              </div>
              <div className="text-muted-foreground text-xs">Peak Day</div>
            </div>
          </div>

          {/* Peak Day Indicator */}
          {maxClicksDay && (
            <div className="rounded-lg bg-gradient-to-br from-dynamic-orange/5 to-dynamic-orange/10 p-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-dynamic-orange"></div>
                <span className="font-medium text-dynamic-orange text-sm">
                  Peak Day:{' '}
                  {new Date(maxClicksDay.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  - {maxClicksDay.clicks}{' '}
                  {t('link-shortener.analytics.clicks_label')}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
