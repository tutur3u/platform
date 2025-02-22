'use client';

import { Priority, Task } from '../../types';
import { TaskCard } from './TaskCard';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';

interface PriorityGroupProps {
  priority: Priority;
  tasks: Task[];
}

export function PriorityGroup({ priority, tasks }: PriorityGroupProps) {
  if (tasks.length === 0) return null;

  return (
    <AccordionItem
      value={priority}
      className="border-none [&[data-state=open]]:bg-muted/50"
    >
      <AccordionTrigger className="rounded-lg border px-4 py-2 hover:bg-muted/50 hover:no-underline [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              priority === 'high'
                ? 'bg-destructive'
                : priority === 'medium'
                  ? 'bg-primary'
                  : 'bg-secondary'
            )}
          />
          <h4 className="font-medium capitalize">{priority} Priority</h4>
          <Badge variant="secondary" className="ml-2">
            {tasks.length}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="rounded-b-lg border border-t-0 px-4 pt-2 pb-4">
        <div className="grid gap-2">
          {tasks.map((task, idx) => (
            <TaskCard key={idx} task={task} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
