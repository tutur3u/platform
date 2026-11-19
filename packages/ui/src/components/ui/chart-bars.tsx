'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
  type ChartTooltipPayload,
} from './chart';

export type ChartBarsSeries = {
  key: string;
  label: ReactNode;
  /** A CSS color or token, for example `var(--chart-1)`. */
  color: string;
};

export type ChartBarsLine = {
  key: string;
  label: ReactNode;
  color: string;
};

export type ChartBarsDatum = Record<string, string | number | null>;

export type ChartBarsProps = {
  data: readonly ChartBarsDatum[];
  /** The field holding each category (a day, a product). */
  xKey: string;
  series: readonly ChartBarsSeries[];
  /** A line drawn over vertical bars (a moving average). */
  line?: ChartBarsLine;
  /** Accessible name of the chart. */
  label: string;
  stacked?: boolean;
  /** Bars run left to right, one category per row. */
  horizontal?: boolean;
  /** Tick text for a category (the tooltip uses `labelFormatter`). */
  tickFormatter?: (value: string, index: number) => string;
  labelFormatter?: (value: string | number) => ReactNode;
  valueFormatter?: (value: number) => string;
  /** Content under the tooltip rows for one category. */
  tooltipFooter?: (datum: ChartBarsDatum) => ReactNode;
  legend?: boolean;
  /** Width reserved for category labels when `horizontal`. */
  categoryWidth?: number;
  /** Open the tooltip on this category before any interaction. */
  defaultIndex?: number;
  className?: string;
};

/**
 * Bars with a hover, focus and tap tooltip, a legend and quiet axes. Arrow
 * keys move the tooltip across categories (Recharts' accessibility layer).
 */
export function ChartBars({
  data,
  xKey,
  series,
  line,
  label,
  stacked = false,
  horizontal = false,
  tickFormatter,
  labelFormatter,
  valueFormatter,
  tooltipFooter,
  legend = series.length > 1,
  categoryWidth = 88,
  defaultIndex,
  className,
}: ChartBarsProps) {
  const config: ChartConfig = Object.fromEntries(
    [...series, ...(line ? [line] : [])].map(({ key, label: text, color }) => [
      key,
      { label: text, color },
    ])
  );
  const formatter = (value: string | number | null) => {
    if (value === null || value === undefined) return '—';
    return valueFormatter
      ? valueFormatter(Number(value))
      : value.toLocaleString();
  };

  return (
    <ChartContainer
      config={config}
      role="group"
      aria-label={label}
      className={cn('aspect-auto h-64 w-full', className)}
    >
      <ComposedChart
        accessibilityLayer
        data={data as ChartBarsDatum[]}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barCategoryGap={horizontal ? 6 : '12%'}
      >
        <CartesianGrid
          horizontal={!horizontal}
          vertical={horizontal}
          strokeDasharray="3 3"
        />
        {horizontal ? (
          <>
            <XAxis type="number" hide />
            <YAxis
              dataKey={xKey}
              type="category"
              width={categoryWidth}
              tickLine={false}
              axisLine={false}
              interval={0}
              tickMargin={6}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={20}
              interval="preserveStartEnd"
              tickFormatter={tickFormatter}
            />
            <YAxis
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickMargin={4}
            />
          </>
        )}
        <ChartTooltip
          defaultIndex={defaultIndex}
          cursor={{ fill: 'var(--accent)', opacity: 0.6 }}
          content={(props) => (
            <ChartTooltipContent
              active={props.active}
              payload={
                props.payload as unknown as ChartTooltipPayload[] | undefined
              }
              label={props.label}
              labelFormatter={labelFormatter}
              footer={
                tooltipFooter && props.payload?.[0]
                  ? tooltipFooter(props.payload[0].payload as ChartBarsDatum)
                  : undefined
              }
              formatter={(value, name, item) => (
                <>
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {config[name]?.label ?? name}
                  </span>
                  <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
                    {formatter(value)}
                  </span>
                </>
              )}
            />
          )}
        />
        {legend && (
          <ChartLegend
            content={
              <ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />
            }
          />
        )}
        {series.map(({ key }, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            stackId={stacked ? 'stack' : undefined}
            stroke={stacked ? 'var(--card)' : undefined}
            strokeWidth={stacked ? 1 : 0}
            radius={
              stacked
                ? index === series.length - 1
                  ? [3, 3, 0, 0]
                  : 0
                : horizontal
                  ? [0, 3, 3, 0]
                  : [3, 3, 0, 0]
            }
            isAnimationActive={false}
          />
        ))}
        {line && !horizontal && (
          <Line
            dataKey={line.key}
            type="monotone"
            stroke={`var(--color-${line.key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
