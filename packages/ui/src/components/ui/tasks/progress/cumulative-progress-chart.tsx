'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../chart';

export interface CumulativeDatum {
  date: string;
  value: number;
}

interface ParConfig {
  startDate: string;
  endDate: string;
  target: number;
}

interface CumulativeProgressChartProps {
  /** Daily delta values (not cumulative); the chart accumulates them. */
  daily: CumulativeDatum[];
  unitLabel?: string;
  /** Draw an expected-pace ("par") line for a dated target goal. */
  par?: ParConfig | null;
  className?: string;
  height?: number;
}

const MS_PER_DAY = 86_400_000;

function parseIsoDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function CumulativeProgressChart({
  daily,
  unitLabel = '',
  par = null,
  className,
  height = 260,
}: CumulativeProgressChartProps) {
  const { rows, hasPar } = useMemo(() => {
    const sorted = [...daily]
      .filter((d) => d?.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build a continuous date axis so gaps read as flat lines, not jumps.
    const parEnabled = Boolean(par && par.target > 0);
    const firstDate = parEnabled
      ? par!.startDate
      : (sorted[0]?.date ?? toIsoDate(new Date()));
    const lastDate = parEnabled
      ? par!.endDate
      : (sorted.at(-1)?.date ?? firstDate);

    const start = parseIsoDate(firstDate);
    const end = parseIsoDate(lastDate);
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
    );

    const deltaByDate = new Map<string, number>();
    for (const d of sorted) {
      deltaByDate.set(
        d.date,
        (deltaByDate.get(d.date) ?? 0) + Number(d.value || 0)
      );
    }

    const todayIso = toIsoDate(new Date());
    const out: Array<{
      date: string;
      cumulative: number | null;
      par: number | null;
    }> = [];
    let running = 0;
    for (let i = 0; i <= totalDays; i++) {
      const iso = toIsoDate(new Date(start.getTime() + i * MS_PER_DAY));
      running += deltaByDate.get(iso) ?? 0;
      const parValue = parEnabled ? (par!.target * i) / totalDays : null;
      out.push({
        date: iso,
        cumulative: iso <= todayIso ? running : null,
        par: parValue,
      });
    }

    return { rows: out, hasPar: parEnabled };
  }, [daily, par]);

  const config: ChartConfig = {
    cumulative: { label: unitLabel || 'Progress', color: 'var(--chart-1)' },
    par: { label: 'Expected pace', color: 'var(--chart-4)' },
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
      <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="cumulativeFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-cumulative)"
              stopOpacity={0.35}
            />
            <stop
              offset="100%"
              stopColor="var(--color-cumulative)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={32}
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
          width={40}
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
        <Area
          connectNulls
          dataKey="cumulative"
          fill="url(#cumulativeFill)"
          stroke="var(--color-cumulative)"
          strokeWidth={2}
          type="monotone"
        />
        {hasPar ? (
          <Line
            dataKey="par"
            dot={false}
            stroke="var(--color-par)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            type="monotone"
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}
