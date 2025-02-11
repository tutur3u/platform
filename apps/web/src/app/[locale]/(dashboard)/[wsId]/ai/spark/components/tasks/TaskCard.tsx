'use client';

import { Task } from '../../types';
import { Badge } from '@tutur3u/ui/components/ui/badge';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div className="group relative rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h5 className="leading-none font-medium">{task.title}</h5>
            <p className="text-sm text-muted-foreground">{task.description}</p>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary">{task.milestone}</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
