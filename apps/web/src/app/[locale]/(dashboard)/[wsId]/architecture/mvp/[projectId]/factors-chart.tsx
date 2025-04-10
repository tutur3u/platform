'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface FactorItem {
  factor: string;
  score: number;
}

interface FactorsChartProps {
  factors: FactorItem[];
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

export function FactorsChart({ factors }: FactorsChartProps) {
  // Process the data for the chart
  const chartData = useMemo(() => {
    return factors.map((item, index) => ({
      name: item.factor,
      value: item.score,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [factors]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">Score: {data.value}</p>
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
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 10]} />
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
