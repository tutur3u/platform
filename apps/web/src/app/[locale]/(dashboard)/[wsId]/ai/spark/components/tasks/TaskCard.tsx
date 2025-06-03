'use client';

import { Task } from '../../types';
import { Badge } from '@ncthub/ui/badge';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div className="bg-card hover:border-primary/50 group relative rounded-lg border p-4 transition-all hover:shadow-sm">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h5 className="font-medium leading-none">{task.title}</h5>
            <p className="text-muted-foreground text-sm">{task.description}</p>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary">{task.milestone}</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
