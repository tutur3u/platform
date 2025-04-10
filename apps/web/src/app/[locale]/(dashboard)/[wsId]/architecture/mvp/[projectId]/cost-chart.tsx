'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface CostItem {
  category: string;
  estimate: string;
  notes: string;
}

interface CostChartProps {
  costBreakdown: CostItem[];
}

// Function to extract numeric values from cost strings
function extractCostValue(costString: string): number {
  // Remove currency symbols, commas, and take the average of any ranges
  const cleanString = costString.replace(/[$,]/g, '');

  // Look for patterns like "10,000 - 15,000" or "10000-15000"
  const rangeMatch = cleanString.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    return (min + max) / 2;
  }

  // Try to extract the first number found
  const numberMatch = cleanString.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  return 0;
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

export function CostChart({ costBreakdown }: CostChartProps) {
  // Process the data for the chart
  const chartData = useMemo(() => {
    return costBreakdown.map((item, index) => ({
      name: item.category,
      value: extractCostValue(item.estimate),
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [costBreakdown]);

  // Render a custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">
            {data.value.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={110}
            fill="var(--color-chart-1)"
            paddingAngle={3}
            dataKey="value"
            label={({ name, percent }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
