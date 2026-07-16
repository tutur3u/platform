'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../chart';

export interface WeekdayDatum {
  weekday: number;
  value: number;
  activeDays?: number;
}

interface WeekdayDistributionChartProps {
  data: WeekdayDatum[];
  /** Short weekday labels, index 0 = Sunday. */
  weekdayLabels?: string[];
  unitLabel?: string;
  className?: string;
  height?: number;
}

const DEFAULT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekdayDistributionChart({
  data,
  weekdayLabels = DEFAULT_LABELS,
  unitLabel = '',
  className,
  height = 220,
}: WeekdayDistributionChartProps) {
  const rows = useMemo(() => {
    const byWeekday = new Map(data.map((d) => [d.weekday, d.value]));
    return weekdayLabels.map((label, index) => ({
      label,
      value: Number(byWeekday.get(index) ?? 0),
    }));
  }, [data, weekdayLabels]);

  const config: ChartConfig = {
    value: { label: unitLabel || 'Progress', color: 'var(--chart-2)' },
  };

  return (
    <ChartContainer
      className={className}
      config={config}
      style={{ height, aspectRatio: 'auto', width: '100%' }}
    >
      <BarChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis axisLine={false} dataKey="label" tickLine={false} />
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
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
