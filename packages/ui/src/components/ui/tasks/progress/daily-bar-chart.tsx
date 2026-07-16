'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../chart';

export interface DailyBarDatum {
  date: string;
  value: number;
}

interface DailyBarChartProps {
  data: DailyBarDatum[];
  unitLabel?: string;
  /** Only render the trailing N days (default 30). */
  days?: number;
  className?: string;
  height?: number;
}

function parseIsoDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function DailyBarChart({
  data,
  unitLabel = '',
  days = 30,
  className,
  height = 240,
}: DailyBarChartProps) {
  const rows = useMemo(
    () =>
      [...data]
        .filter((d) => d?.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-days),
    [data, days]
  );

  const config: ChartConfig = {
    value: { label: unitLabel || 'Progress', color: 'var(--chart-1)' },
  };

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    []
  );

  return (
    <ChartContainer
      className={className}
      config={config}
      style={{ height, aspectRatio: 'auto', width: '100%' }}
    >
      <BarChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={24}
          tickFormatter={(value) =>
            dateFormatter.format(parseIsoDate(String(value)))
          }
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tickFormatter={(value) =>
            new Intl.NumberFormat(undefined, { notation: 'compact' }).format(
              Number(value)
            )
          }
          tickLine={false}
          width={36}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                dateFormatter.format(parseIsoDate(String(value)))
              }
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
