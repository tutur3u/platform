'use client';

import type { JournalMoodPoint } from '@tuturuuu/internal-api/personal-journal';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@tuturuuu/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

const chartConfig = {
  average: { label: 'Average', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function formatPeriod(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export default function JournalMoodChart({
  points,
  emptyLabel,
  averageLabel,
  countLabel,
}: {
  points: readonly JournalMoodPoint[];
  emptyLabel: string;
  averageLabel: string;
  countLabel: string;
}) {
  if (points.length === 0) return <p>{emptyLabel}</p>;
  const rows = points.map((point) => ({
    period: point.period,
    average: point.sum / point.count,
    count: point.count,
  }));
  return (
    <>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-52 w-full min-w-0 sm:h-64"
      >
        <LineChart
          data={rows}
          margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="period"
            minTickGap={24}
            tickFormatter={(value) => formatPeriod(String(value))}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tickLine={false}
            width={28}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as
                | { period?: string; average?: number; count?: number }
                | undefined;
              if (!row?.period || row.average === undefined) return null;
              return (
                <div className="rounded-md border bg-background px-2 py-1 text-xs">
                  <div>{formatPeriod(row.period)}</div>
                  <div>
                    {averageLabel}: {row.average.toFixed(1)}
                  </div>
                  <div>
                    {countLabel}: {row.count ?? 0}
                  </div>
                </div>
              );
            }}
          />
          <Line
            dataKey="average"
            dot={false}
            stroke="var(--color-average)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{averageLabel}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>{averageLabel}</th>
            <th>{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period}>
              <td>{row.period}</td>
              <td>{row.average.toFixed(1)}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
