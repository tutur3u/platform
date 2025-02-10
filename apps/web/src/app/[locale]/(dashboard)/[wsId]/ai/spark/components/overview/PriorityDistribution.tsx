'use client';

import { Priority, Task } from '../../types';
import { cn } from '@/lib/utils';

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
              className="bg-muted/50 hover:bg-muted/80 group relative rounded-lg border p-2 text-center transition-colors"
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
              <div className="text-muted-foreground text-xs">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
