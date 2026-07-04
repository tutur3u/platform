'use client';

import { ArrowDown, ArrowUp, Minus } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';

interface MetricData {
  title: string;
  value: string | number;
  change?: number | null;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
}

interface Props {
  metrics: MetricData[];
}

export default function MetricCards({ metrics }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {metric.title}
            </CardTitle>
            {metric.icon}
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{metric.value}</div>
            {metric.change !== undefined &&
              metric.change !== null &&
              metric.changeLabel && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {metric.trend === 'up' && (
                    <ArrowUp className="h-3 w-3 text-green-500" />
                  )}
                  {metric.trend === 'down' && (
                    <ArrowDown className="h-3 w-3 text-red-500" />
                  )}
                  {metric.trend === 'stable' && (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      'font-medium',
                      metric.trend === 'up' && 'text-green-500',
                      metric.trend === 'down' && 'text-red-500',
                      metric.trend === 'stable' && 'text-muted-foreground'
                    )}
                  >
                    {metric.change > 0 ? '+' : ''}
                    {metric.change.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    {metric.changeLabel}
                  </span>
                </div>
              )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
