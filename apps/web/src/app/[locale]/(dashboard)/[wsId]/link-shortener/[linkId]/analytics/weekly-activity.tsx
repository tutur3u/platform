'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { Calendar } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

interface WeeklyActivityProps {
  clicksByDayOfWeek: Array<{
    day_of_week: number | null;
    day_name: string | undefined;
    clicks: number | null;
  }>;
}

const chartConfig = {
  clicks: {
    label: 'Clicks',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

export function WeeklyActivity({ clicksByDayOfWeek }: WeeklyActivityProps) {
  const t = useTranslations();

  // Map day_of_week numbers to translated names
  const getTranslatedDayName = (dayOfWeek: number | null) => {
    const dayKeys = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ] as const;

    if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) {
      return 'Unknown';
    }

    type DayKey = (typeof dayKeys)[number];

    return t(
      `link-shortener.analytics.weekdays.${dayKeys[dayOfWeek] as DayKey}`
    );
  };

  // Prepare chart data with translated names
  const chartData = clicksByDayOfWeek.map((day) => ({
    day: getTranslatedDayName(day.day_of_week),
    clicks: day.clicks || 0,
  }));

  // Calculate summary statistics
  const totalClicks = clicksByDayOfWeek.reduce(
    (sum, day) => sum + (day.clicks || 0),
    0
  );
  const averageClicks = totalClicks > 0 ? Math.round(totalClicks / 7) : 0;
  const peakDay = clicksByDayOfWeek.reduce((max, day) =>
    (day.clicks || 0) > (max.clicks || 0) ? day : max
  );

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/80 via-card to-card/80 shadow-xl backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-dynamic-green/10 p-2">
            <Calendar className="h-5 w-5 text-dynamic-green" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {t('link-shortener.analytics.activity_by_day')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.weekly_pattern')}
                </p>
              </div>
              <div className="text-right">
                <div className="font-bold text-2xl text-dynamic-green">
                  {totalClicks}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('link-shortener.analytics.total_clicks')}
                </div>
              </div>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        {clicksByDayOfWeek.length > 0 && totalClicks > 0 ? (
          <div className="space-y-4">
            <div className="h-64">
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="day"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="clicks"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="text-center">
                <div className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.avg_per_day')}
                </div>
                <div className="font-semibold text-dynamic-green">
                  {averageClicks}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-sm">
                  {t('link-shortener.analytics.peak_day')}
                </div>
                <div className="font-semibold text-dynamic-green">
                  {getTranslatedDayName(peakDay.day_of_week)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {t('link-shortener.analytics.no_weekly_data')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
