'use client';

import { Activity } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { SectionCard } from './section-card';
import { StudioEmptyState } from './states';

export interface TrendPoint {
  cost: number;
  credits: number;
  date: string;
  requests: number;
}

export type TrendMeasure = 'cost' | 'credits' | 'requests';

const MEASURES: TrendMeasure[] = ['requests', 'credits', 'cost'];

const chartConfig = {
  cost: { color: 'var(--chart-4)' },
  credits: { color: 'var(--chart-2)' },
  requests: { color: 'var(--chart-1)' },
} satisfies ChartConfig;

/**
 * One daily-volume chart shared by the overview and the usage section, with the
 * measure switched in place so all three series stay on a single axis.
 */
export function MeasureTrendChart({
  className,
  data,
  description,
  emptyDescription,
  emptyTitle,
  isLoading,
  measureLabels,
  title,
}: {
  className?: string;
  data: TrendPoint[];
  description?: string;
  emptyDescription?: string;
  emptyTitle: string;
  isLoading?: boolean;
  measureLabels: Record<TrendMeasure, string>;
  title: string;
}) {
  const [measure, setMeasure] = useState<TrendMeasure>('requests');
  const gradientId = useId().replace(/:/g, '');
  const points = useMemo(
    () => data.map((point) => ({ ...point, label: formatDay(point.date) })),
    [data]
  );

  return (
    <SectionCard
      actions={
        <div className="flex rounded-lg border p-0.5">
          {MEASURES.map((value) => (
            <Button
              aria-pressed={measure === value}
              className="h-7 px-2.5 text-xs"
              key={value}
              onClick={() => setMeasure(value)}
              size="sm"
              type="button"
              variant={measure === value ? 'secondary' : 'ghost'}
            >
              {measureLabels[value]}
            </Button>
          ))}
        </div>
      }
      className={className}
      description={description}
      icon={Activity}
      title={title}
    >
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : points.length ? (
        <ChartContainer className="h-56 w-full" config={chartConfig}>
          <AreaChart
            data={points}
            margin={{ bottom: 0, left: 4, right: 8, top: 8 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={`var(--color-${measure})`}
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor={`var(--color-${measure})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={24}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={compactNumber}
              tickLine={false}
              width={44}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    typeof value === 'number'
                      ? value.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })
                      : value,
                    ` ${measureLabels[measure]}`,
                  ]}
                  labelFormatter={(_, payload) => {
                    const date = payload?.[0]?.payload.date;
                    return typeof date === 'string' ? formatFullDay(date) : '';
                  }}
                />
              }
            />
            <Area
              dataKey={measure}
              fill={`url(#${gradientId})`}
              stroke={`var(--color-${measure})`}
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <StudioEmptyState
          className="min-h-56"
          description={emptyDescription}
          icon={Activity}
          title={emptyTitle}
        />
      )}
    </SectionCard>
  );
}

function formatDay(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatFullDay(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
}

function compactNumber(value: number) {
  return value >= 1000
    ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
