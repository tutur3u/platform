'use client';

import { Calendar, CheckCircle2, Circle, User } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { AssigneeTasksVisualization } from '../../types/visualizations';

interface AssigneeTasksCardProps {
  data: AssigneeTasksVisualization['data'];
}

const priorityConfig: Record<
  string,
  { color: string; bgColor: string; label: string }
> = {
  critical: {
    color: 'text-dynamic-red',
    bgColor: 'bg-dynamic-red/15',
    label: 'Critical',
  },
  high: {
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/15',
    label: 'High',
  },
  normal: {
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/15',
    label: 'Normal',
  },
  low: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    label: 'Low',
  },
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AssigneeTasksCard({ data }: AssigneeTasksCardProps) {
  const { title, assignee, tasks, totalCount } = data;

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="border-border/30 border-b bg-dynamic-cyan/10 px-4 py-3 pr-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-cyan/20">
            {assignee.avatarUrl ? (
              <Image
                src={assignee.avatarUrl}
                alt={assignee.name || 'Assignee Avatar'}
                className="h-full w-full rounded-full object-cover"
                width={28}
                height={28}
              />
            ) : (
              <User className="h-4 w-4 text-dynamic-cyan" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{title}</h3>
            {assignee.name && (
              <p className="text-muted-foreground text-xs">{assignee.name}</p>
            )}
          </div>
          <Badge variant="secondary" className="font-semibold">
            {totalCount} tasks
          </Badge>
        </div>
      </div>

      {/* Tasks List */}
      <div className="max-h-72 divide-y divide-border/20 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-dynamic-green/50" />
            <span className="text-sm">No tasks assigned</span>
          </div>
        ) : (
          tasks.map((task) => {
            const priority = task.priority
              ? priorityConfig[task.priority]
              : null;
            const isOverdue =
              task.endDate && new Date(task.endDate) < new Date();

            return (
              <div
                key={task.id}
                className={cn(
                  'group flex items-start gap-3 px-4 py-3 transition-all duration-200',
                  'hover:bg-muted/40',
                  task.isCompleted && 'opacity-60'
                )}
              >
                {/* Completion icon */}
                <div className="mt-0.5 transition-transform duration-200 group-hover:scale-110">
                  {task.isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  ) : (
                    <Circle
                      className={cn(
                        'h-4 w-4',
                        isOverdue
                          ? 'text-dynamic-red/70'
                          : 'text-muted-foreground/50'
                      )}
                    />
                  )}
                </div>

                {/* Task Content */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p
                    className={cn(
                      'text-sm leading-snug transition-colors',
                      task.isCompleted && 'text-muted-foreground line-through'
                    )}
                  >
                    {task.name}
                  </p>

                  {/* Meta Info Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {priority && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 font-medium text-xs',
                          priority.bgColor,
                          priority.color
                        )}
                      >
                        {task.priorityLabel || priority.label}
                      </span>
                    )}

                    {task.endDate && (
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                          isOverdue
                            ? 'bg-dynamic-red/10 text-dynamic-red'
                            : 'bg-muted/50 text-muted-foreground'
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {formatDate(task.endDate)}
                      </span>
                    )}

                    {task.listStatus && (
                      <span className="rounded bg-muted/50 px-1.5 py-0.5 text-muted-foreground text-xs">
                        {task.listStatus.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {tasks.length > 5 && (
        <div className="border-border/30 border-t bg-muted/20 px-4 py-2 text-center">
          <span className="text-muted-foreground text-xs">
            Showing all {tasks.length} tasks
          </span>
        </div>
      )}
    </Card>
  );
}
