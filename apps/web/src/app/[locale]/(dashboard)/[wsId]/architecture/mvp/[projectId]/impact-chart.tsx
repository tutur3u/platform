'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { BarChartIcon } from 'lucide-react';
import { FC } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ImpactMetric {
  name: string;
  value: number;
  color?: string;
}

interface ImpactChartProps {
  title?: string;
  description?: string;
  metrics: ImpactMetric[];
  className?: string;
  height?: number | string;
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

export const ImpactChart: FC<ImpactChartProps> = ({
  title = 'Impact Metrics',
  description,
  metrics,
  className,
  height = 300,
}) => {
  if (!metrics || metrics.length === 0) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChartIcon className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No impact data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChartIcon className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart
              data={metrics}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 60,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow)',
                }}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                fill="var(--color-chart-1)"
              >
                {metrics.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.color || CHART_COLORS[index % CHART_COLORS.length]
                    }
                  />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ImpactChart;
