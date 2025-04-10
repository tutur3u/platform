'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ImpactItem {
  measure: string;
  score: number;
}

interface ImpactMeasureChartProps {
  measures: ImpactItem[];
}

// Use CSS variables for colors from globals.css
const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-dynamic-blue)',
  'var(--color-dynamic-green)',
  'var(--color-dynamic-orange)',
  'var(--color-dynamic-purple)',
  'var(--color-dynamic-red)',
];

export function ImpactMeasureChart({ measures }: ImpactMeasureChartProps) {
  // Process the data for the chart
  const chartData = useMemo(() => {
    return measures.map((item, index) => ({
      name: item.measure,
      value: item.score,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [measures]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">Impact: {data.value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
        >
          <XAxis type="number" domain={[0, 10]} />
          <YAxis type="category" dataKey="name" width={80} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" fill="var(--color-chart-1)">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
