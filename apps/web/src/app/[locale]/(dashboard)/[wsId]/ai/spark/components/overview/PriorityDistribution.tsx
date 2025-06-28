'use client';

import { cn } from '@tuturuuu/utils/format';
import type { Priority, Task } from '../../types';

interface PriorityDistributionProps {
  tasks: Task[];
}

export function PriorityDistribution({ tasks }: PriorityDistributionProps) {
  const priorities: Priority[] = ['high', 'medium', 'low'];

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Priority Distribution</span>
      <div className="grid grid-cols-3 gap-2">
        {priorities.map((priority) => {
          const count = tasks.filter(
            (task) => task.priority === priority
          ).length;
          const total = tasks.length || 1;
          const percentage = Math.round((count / total) * 100);

          return (
            <div
              key={priority}
              className="group relative rounded-lg border bg-muted/50 p-2 text-center transition-colors hover:bg-muted/80"
            >
              <div
                className={cn(
                  'text-xs font-medium',
                  priority === 'high'
                    ? 'text-destructive'
                    : priority === 'medium'
                      ? 'text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {priority.toUpperCase()}
              </div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
