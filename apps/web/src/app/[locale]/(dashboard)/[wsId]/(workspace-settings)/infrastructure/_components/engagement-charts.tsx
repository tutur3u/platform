'use client';

import type {
  ActivityHeatmap,
  EngagementMetricsOverTime,
} from '@tuturuuu/types';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

interface Props {
  data: EngagementMetricsOverTime[];
  heatmapData?: ActivityHeatmap[];
}

const EngagementCharts = ({ data, heatmapData }: Props) => {
  const t = useTranslations('infrastructure-analytics');

  const chartConfig = {
    dau: {
      label: t('engagement.dau'),
      color: 'hsl(217, 91%, 60%)',
    },
    wau: {
      label: t('engagement.wau'),
      color: 'hsl(142, 76%, 36%)',
    },
    mau: {
      label: t('engagement.mau'),
      color: 'hsl(262, 83%, 58%)',
    },
  };

  const processedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      displayDate: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }));
  }, [data]);

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('engagement.no-data')}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* DAU/WAU/MAU Chart */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-lg">{t('engagement.title')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('engagement.description')}
          </p>
        </div>

        <ChartContainer config={chartConfig} className="h-80 w-full">
          <AreaChart
            data={processedData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillDAU" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-dau)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-dau)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillWAU" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-wau)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-wau)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillMAU" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-mau)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-mau)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="mau"
              stroke="var(--color-mau)"
              fill="url(#fillMAU)"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="wau"
              stroke="var(--color-wau)"
              fill="url(#fillWAU)"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="dau"
              stroke="var(--color-dau)"
              fill="url(#fillDAU)"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Activity Heatmap */}
      {heatmapData && heatmapData.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-lg">
              {t('engagement.heatmap-title')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('engagement.heatmap-description')}
            </p>
          </div>

          <ActivityHeatmapChart data={heatmapData} />
        </div>
      )}
    </div>
  );
};

function ActivityHeatmapChart({ data }: { data: ActivityHeatmap[] }) {
  const t = useTranslations('infrastructure-analytics');
  const [hoveredCell, setHoveredCell] = React.useState<{
    day: number;
    hour: number;
    count: number;
  } | null>(null);

  const days = [
    t('engagement.days.sunday'),
    t('engagement.days.monday'),
    t('engagement.days.tuesday'),
    t('engagement.days.wednesday'),
    t('engagement.days.thursday'),
    t('engagement.days.friday'),
    t('engagement.days.saturday'),
  ];

  const maxActivity = useMemo(() => {
    return Math.max(...data.map((d) => d.activity_count), 1);
  }, [data]);

  const totalActivity = useMemo(() => {
    return data.reduce((sum, d) => sum + d.activity_count, 0);
  }, [data]);

  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-muted/30';
    const intensity = count / maxActivity;
    if (intensity > 0.75) return 'bg-dynamic-blue/90';
    if (intensity > 0.5) return 'bg-dynamic-blue/70';
    if (intensity > 0.25) return 'bg-dynamic-blue/50';
    return 'bg-dynamic-blue/30';
  };

  const heatmapGrid = useMemo(() => {
    const grid: { [key: string]: number } = {};
    data.forEach((item) => {
      const key = `${item.day_of_week}-${item.hour_of_day}`;
      grid[key] = item.activity_count;
    });
    return grid;
  }, [data]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Metrics Summary */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-muted-foreground text-xs">Total Activities</p>
            <p className="font-bold text-xl">
              {totalActivity.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Peak Activity</p>
            <p className="font-bold text-xl">{maxActivity.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg Per Hour</p>
            <p className="font-bold text-xl">
              {(totalActivity / (7 * 24)).toFixed(1)}
            </p>
          </div>
          <div className="ml-auto h-[52px]">
            {hoveredCell && (
              <div className="flex h-full flex-col justify-center rounded-lg bg-primary/10 px-4">
                <p className="text-muted-foreground text-xs">
                  {days[hoveredCell.day]}, {hoveredCell.hour}:00
                </p>
                <p className="font-bold text-primary text-xl">
                  {hoveredCell.count.toLocaleString()} activities
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col justify-around py-2">
            {days.map((day, idx) => (
              <div
                key={idx}
                className="h-6 text-right text-muted-foreground text-xs"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="flex-1">
            <div className="mb-2 grid grid-cols-24 gap-1">
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="text-center text-muted-foreground text-xs"
                >
                  {hour}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-24 gap-1">
              {Array.from({ length: 7 * 24 }, (_, idx) => {
                const day = Math.floor(idx / 24);
                const hour = idx % 24;
                const key = `${day}-${hour}`;
                const count = heatmapGrid[key] || 0;
                return (
                  <div
                    key={idx}
                    className={`relative h-6 cursor-pointer rounded ${getCellColor(count)} transition-all hover:scale-110 hover:ring-2 hover:ring-primary`}
                    onMouseEnter={() => setHoveredCell({ day, hour, count })}
                    onMouseLeave={() => setHoveredCell(null)}
                    title={`${days[day]}, ${hour}:00 - ${count} activities`}
                  >
                    {count > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center font-bold text-[8px] opacity-0 transition-opacity hover:opacity-100">
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t('engagement.less')}
            </span>
            <div className="h-4 w-4 rounded bg-muted/30" />
            <div className="h-4 w-4 rounded bg-dynamic-blue/30" />
            <div className="h-4 w-4 rounded bg-dynamic-blue/50" />
            <div className="h-4 w-4 rounded bg-dynamic-blue/70" />
            <div className="h-4 w-4 rounded bg-dynamic-blue/90" />
            <span className="text-muted-foreground">
              {t('engagement.more')}
            </span>
          </div>
          <p className="text-muted-foreground">
            Hover over cells to see activity counts
          </p>
        </div>
      </div>
    </div>
  );
}

export default EngagementCharts;
