'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Search,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { TaskListVisualization } from '../../types/visualizations';

interface TaskListCardProps {
  data: TaskListVisualization['data'];
  isFullscreen?: boolean;
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

const categoryConfig: Record<
  string,
  { icon: typeof AlertCircle; color: string; bgColor: string; label: string }
> = {
  overdue: {
    icon: AlertCircle,
    color: 'text-dynamic-red',
    bgColor: 'bg-dynamic-red/10',
    label: 'Overdue',
  },
  today: {
    icon: Clock,
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/10',
    label: 'Today',
  },
  upcoming: {
    icon: Calendar,
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    label: 'Upcoming',
  },
  search_results: {
    icon: Search,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    label: 'Results',
  },
};

function formatDate(dateString: string | null): string {
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

export function TaskListCard({
  data,
  isFullscreen = false,
}: TaskListCardProps) {
  const { title, category, tasks } = data;
  const categoryStyle = category ? categoryConfig[category] : null;
  const CategoryIcon = categoryStyle?.icon || Circle;

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div
        className={cn(
          'border-border/30 border-b px-4 py-3',
          !isFullscreen && 'pr-12',
          categoryStyle?.bgColor
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              categoryStyle?.bgColor || 'bg-muted/50'
            )}
          >
            <CategoryIcon
              className={cn(
                'h-4 w-4',
                categoryStyle?.color || 'text-muted-foreground'
              )}
            />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <Badge variant="secondary" className="font-semibold">
            {tasks.length}
          </Badge>
        </div>
      </div>

      {/* Task List */}
      <div
        className={cn(
          'divide-y divide-border/20 overflow-y-auto',
          !isFullscreen && 'max-h-72'
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-dynamic-green/50" />
            <span className="text-sm">No tasks found</span>
          </div>
        ) : (
          tasks.map((task) => {
            const priority = task.priority
              ? priorityConfig[task.priority]
              : null;
            const isOverdue =
              category === 'overdue' ||
              (task.endDate && new Date(task.endDate) < new Date());

            return (
              <div
                key={task.id}
                className={cn(
                  'group flex items-start gap-3 px-4 py-3 transition-all duration-200',
                  'hover:bg-muted/40',
                  task.completed && 'opacity-60'
                )}
              >
                {/* Completion Status */}
                <div className="mt-0.5 transition-transform duration-200 group-hover:scale-110">
                  {task.completed ? (
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
                      task.completed && 'text-muted-foreground line-through'
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
                        {priority.label}
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

                    {task.assignees && task.assignees.length > 0 && (
                      <span className="flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-muted-foreground text-xs">
                        <User className="h-3 w-3" />
                        {task.assignees.length === 1
                          ? task.assignees[0]?.name
                          : `${task.assignees.length}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer with count */}
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
