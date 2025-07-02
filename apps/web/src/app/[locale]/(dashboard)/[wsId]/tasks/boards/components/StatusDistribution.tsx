'use client';

import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

interface StatusDistributionProps {
  allTasks: any[];
  selectedBoard: string | null;
}

export function StatusDistribution({
  allTasks,
  selectedBoard,
}: StatusDistributionProps) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const statusCounts = useMemo(() => {
    const counts = {
      not_started: 0,
      active: 0,
      done: 0,
      closed: 0,
    };

    filteredTasks.forEach((task) => {
      const status = task.listStatus || 'not_started';
      if (status === 'done' || task.archived) {
        counts.done += 1;
      } else if (status === 'closed') {
        counts.closed += 1;
      } else if (status === 'active') {
        counts.active += 1;
      } else {
        counts.not_started += 1;
      }
    });

    return counts;
  }, [filteredTasks]);

  const total = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const statusConfig = [
    {
      key: 'not_started',
      label: 'Not Started',
      color: 'bg-gray-400',
      percentage: total > 0 ? (statusCounts.not_started / total) * 100 : 0,
    },
    {
      key: 'active',
      label: 'Active',
      color: 'bg-blue-500',
      percentage: total > 0 ? (statusCounts.active / total) * 100 : 0,
    },
    {
      key: 'done',
      label: 'Done',
      color: 'bg-green-500',
      percentage: total > 0 ? (statusCounts.done / total) * 100 : 0,
    },
    {
      key: 'closed',
      label: 'Closed',
      color: 'bg-purple-500',
      percentage: total > 0 ? (statusCounts.closed / total) * 100 : 0,
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Status Distribution</h4>
        <span className="text-xs text-muted-foreground">{total} tasks</span>
      </div>
      <div className="space-y-3">
        {statusConfig.map((status) => (
          <div key={status.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('h-3 w-3 rounded', status.color)}></div>
                <span className="text-sm">{status.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {statusCounts[status.key as keyof typeof statusCounts]}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({status.percentage.toFixed(0)}%)
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  status.color
                )}
                style={{ width: `${status.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </Card>
  );
}
