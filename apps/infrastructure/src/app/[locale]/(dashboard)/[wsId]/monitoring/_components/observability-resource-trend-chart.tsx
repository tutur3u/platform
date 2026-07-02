'use client';

import type { ObservabilityResourceBucket } from '@tuturuuu/internal-api/infrastructure/monitoring';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { cn } from '@tuturuuu/utils/format';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactNumber } from './formatters';
import {
  type ResourceTone,
  resourceToneClasses,
} from './observability-resource-theme';

export function formatResourceNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return formatCompactNumber(value).toLowerCase();
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

export function ResourceChartsLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-lg border border-border bg-background">
        <ChartSkeleton />
      </section>
      <section className="rounded-lg border border-border bg-background">
        <ChartSkeleton />
      </section>
      <section className="rounded-lg border border-border bg-background">
        <ChartSkeleton />
      </section>
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

function SamplingStrip({
  buckets,
  label,
}: {
  buckets: ObservabilityResourceBucket[];
  label: string;
}) {
  if (buckets.length <= 1) {
    return null;
  }

  return (
    <div className="border-border/60 border-t px-4 py-3">
      <div
        aria-label={label}
        className="flex h-2 overflow-hidden rounded-full"
        role="img"
      >
        {buckets.map((bucket) => {
          const sampled = (bucket.sampleCount ?? 0) > 0;
          const tone = sampled
            ? 'green'
            : bucket.hasLiveSample
              ? 'blue'
              : 'red';

          return (
            <span
              className={cn(
                'min-w-1 flex-1',
                tone === 'green'
                  ? 'bg-dynamic-green/70'
                  : tone === 'blue'
                    ? 'bg-dynamic-blue/80'
                    : 'bg-dynamic-red/45'
              )}
              key={`${bucket.bucketStart}-${bucket.sampleCount ?? 0}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ResourceTrendChart({
  buckets,
  emptyLabel,
  formatter,
  samplingStripLabel,
  series,
  title,
}: {
  buckets: ObservabilityResourceBucket[];
  emptyLabel: string;
  formatter: (value: number | null | undefined) => string;
  samplingStripLabel: string;
  series: Array<{
    getValue: (bucket: ObservabilityResourceBucket) => number | null;
    label: string;
    tone: ResourceTone;
  }>;
  title: string;
}) {
  const chartData = buckets.map((bucket) => {
    const point: Record<string, number | string | null> = {
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
  const gradientId = `resource-${title.replace(/\W+/gu, '-').toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
        <p className="font-medium text-sm">{title}</p>
        <div className="flex flex-wrap items-center justify-end gap-3 text-muted-foreground text-xs">
          {series.map((item) => {
            const latest = [...buckets]
              .reverse()
              .map((bucket) => item.getValue(bucket))
              .find((value) => value != null);

            return (
              <span className="inline-flex items-center gap-1" key={item.label}>
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    resourceToneClasses[item.tone].dot
                  )}
                />
                {item.label}
                <span className="font-mono text-foreground">
                  {formatter(latest)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      {buckets.length > 0 ? (
        <>
          <ChartContainer
            className="h-64 w-full px-3 py-4"
            config={chartConfig}
          >
            {series.length > 1 ? (
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="time"
                  minTickGap={24}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value) => formatter(Number(value))}
                  tickLine={false}
                  width={58}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        formatter(Number(value)),
                        name,
                      ]}
                    />
                  }
                />
                {series.map((item, index) => (
                  <Bar
                    dataKey={`series${index}`}
                    fill={`var(--color-series${index})`}
                    key={item.label}
                    name={item.label}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </ComposedChart>
            ) : (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-series0)"
                      stopOpacity={0.35}
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
                  tickFormatter={(value) => formatter(Number(value))}
                  tickLine={false}
                  width={58}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        formatter(Number(value)),
                        name,
                      ]}
                    />
                  }
                />
                <Area
                  connectNulls={false}
                  dataKey="series0"
                  fill={`url(#${gradientId})`}
                  name={series[0]?.label}
                  stroke="var(--color-series0)"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            )}
          </ChartContainer>
          <SamplingStrip buckets={buckets} label={samplingStripLabel} />
        </>
      ) : (
        <EmptyChart label={emptyLabel} />
      )}
    </section>
  );
}
