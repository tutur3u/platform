'use client';

import { BarChart3, CheckCircle2 } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { StatusDistributionVisualization } from '../../types/visualizations';

interface StatusChartProps {
  data: StatusDistributionVisualization['data'];
  isFullscreen?: boolean;
}

const statusConfig = [
  {
    key: 'not_started' as const,
    label: 'Not Started',
    color: 'bg-gray-400',
    textColor: 'text-gray-500',
  },
  {
    key: 'active' as const,
    label: 'Active',
    color: 'bg-dynamic-blue',
    textColor: 'text-dynamic-blue',
  },
  {
    key: 'done' as const,
    label: 'Done',
    color: 'bg-dynamic-green',
    textColor: 'text-dynamic-green',
  },
  {
    key: 'closed' as const,
    label: 'Closed',
    color: 'bg-dynamic-purple',
    textColor: 'text-dynamic-purple',
  },
];

export function StatusChart({ data, isFullscreen = false }: StatusChartProps) {
  const { title, total, counts } = data;

  // Calculate completed percentage (done + closed)
  const completedCount = counts.done + counts.closed;
  const completedPercentage =
    total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div
        className={cn(
          'border-border/30 border-b bg-muted/20 px-4 py-3',
          !isFullscreen && 'pr-12'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            {total} tasks
          </span>
        </div>
      </div>

      {/* Progress Ring Summary */}
      {total > 0 && (
        <div className="flex items-center justify-center gap-4 border-border/20 border-b bg-muted/10 px-4 py-4">
          <div className="relative h-16 w-16">
            <svg className="h-16 w-16 -rotate-90 transform">
              <title>Overall Completion Percentage</title>
              <circle
                className="text-muted/30"
                strokeWidth="6"
                stroke="currentColor"
                fill="transparent"
                r="28"
                cx="32"
                cy="32"
              />
              <circle
                className="text-dynamic-green transition-all duration-500"
                strokeWidth="6"
                strokeDasharray={`${completedPercentage * 1.76} 176`}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="28"
                cx="32"
                cy="32"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-bold text-sm">
              {completedPercentage}%
            </span>
          </div>
          <div className="text-left">
            <p className="font-medium text-sm">
              {completedCount} of {total} complete
            </p>
            <p className="text-muted-foreground text-xs">
              {counts.active > 0 && `${counts.active} in progress`}
              {counts.active > 0 && counts.not_started > 0 && ', '}
              {counts.not_started > 0 && `${counts.not_started} not started`}
            </p>
          </div>
        </div>
      )}

      {/* Status Bars */}
      <div className="space-y-3 p-4">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-dynamic-green/50" />
            <span className="text-sm">No tasks found</span>
          </div>
        ) : (
          statusConfig.map((status) => {
            const count = counts[status.key];
            const percentage = total > 0 ? (count / total) * 100 : 0;

            return (
              <div key={status.key} className="group space-y-1.5">
                {/* Label Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full transition-transform group-hover:scale-110',
                        status.color
                      )}
                    />
                    <span className="font-medium text-sm">{status.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className={cn('font-bold text-sm', status.textColor)}>
                      {count}
                    </span>
                    <span className="w-10 text-muted-foreground text-xs">
                      ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all duration-500 ease-out',
                      status.color,
                      'group-hover:brightness-110'
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
