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
      <span className="font-medium text-sm">Priority Distribution</span>
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
                  'font-medium text-xs',
                  priority === 'high'
                    ? 'text-destructive'
                    : priority === 'medium'
                      ? 'text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {priority.toUpperCase()}
              </div>
              <div className="font-bold text-2xl">{count}</div>
              <div className="text-muted-foreground text-xs">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
