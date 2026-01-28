'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { memo } from 'react';
import type { TunaTask } from '../../types/tuna';

interface TasksPanelItemProps {
  task: TunaTask;
  isLoading: boolean;
  onComplete: (taskId: string) => void;
  onClick?: (taskId: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-l-dynamic-red',
  high: 'border-l-dynamic-orange',
  normal: 'border-l-dynamic-blue',
  low: 'border-l-muted-foreground',
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) {
    return `${Math.abs(diffDays)} days ago`;
  }
  if (diffDays === -1) {
    return 'Yesterday';
  }
  if (diffDays === 0) {
    // Check if it's today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    if (date >= todayStart && date <= todayEnd) {
      return 'Today';
    }
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Tomorrow';
  }
  if (diffDays <= 7) {
    return `In ${diffDays} days`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const TasksPanelItem = memo(function TasksPanelItem({
  task,
  isLoading,
  onComplete,
  onClick,
}: TasksPanelItemProps) {
  const isOverdue = task.end_date && new Date(task.end_date) < new Date();
  const priorityColor =
    PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.normal;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-lg border-l-4 bg-muted/30 p-3 transition-colors',
        priorityColor,
        'hover:bg-muted/50'
      )}
    >
      {/* Checkbox */}
      <div className="relative mt-0.5 flex-shrink-0">
        {isLoading ? (
          <div className="flex h-4 w-4 items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Checkbox
            checked={false}
            className={cn(
              'h-4 w-4 transition-all duration-200',
              'hover:scale-110 hover:border-dynamic-green',
              isOverdue && 'border-dynamic-red/70 ring-1 ring-dynamic-red/20'
            )}
            onCheckedChange={() => onComplete(task.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Content */}
      <div
        className={cn('min-w-0 flex-1', onClick && 'cursor-pointer')}
        onClick={() => onClick?.(task.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(task.id);
          }
        }}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <p
          className={cn(
            'text-sm font-medium leading-tight',
            'line-clamp-2',
            isOverdue && 'text-dynamic-red'
          )}
        >
          {task.name}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {/* Board name badge */}
          {task.board_name && (
            <Badge
              variant="outline"
              className="bg-muted/50 text-xs font-normal"
            >
              {task.board_name}
            </Badge>
          )}

          {/* Due date */}
          {task.end_date && (
            <span
              className={cn(
                'text-xs',
                isOverdue
                  ? 'font-medium text-dynamic-red'
                  : 'text-muted-foreground'
              )}
            >
              {formatRelativeDate(task.end_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
