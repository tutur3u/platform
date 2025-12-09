'use client';

import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Folder,
  Tag,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { TaskDetailVisualization } from '../../types/visualizations';

interface TaskDetailViewProps {
  data: TaskDetailVisualization['data'];
  isFullscreen?: boolean;
}

const priorityConfig: Record<
  string,
  { color: string; bgColor: string; label: string; ringColor: string }
> = {
  critical: {
    color: 'text-dynamic-red',
    bgColor: 'bg-dynamic-red/15',
    label: 'Critical',
    ringColor: 'ring-dynamic-red/30',
  },
  high: {
    color: 'text-dynamic-orange',
    bgColor: 'bg-dynamic-orange/15',
    label: 'High',
    ringColor: 'ring-dynamic-orange/30',
  },
  normal: {
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/15',
    label: 'Normal',
    ringColor: 'ring-dynamic-blue/30',
  },
  low: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    label: 'Low',
    ringColor: 'ring-muted/30',
  },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getRelativeDate(dateString: string | null): {
  text: string;
  isOverdue: boolean;
  isToday: boolean;
} {
  if (!dateString) return { text: '', isOverdue: false, isToday: false };
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0)
    return {
      text: `${Math.abs(days)}d overdue`,
      isOverdue: true,
      isToday: false,
    };
  if (days === 0) return { text: 'Today', isOverdue: false, isToday: true };
  if (days === 1) return { text: 'Tomorrow', isOverdue: false, isToday: false };
  if (days < 7)
    return { text: `In ${days} days`, isOverdue: false, isToday: false };
  return { text: '', isOverdue: false, isToday: false };
}

export function TaskDetailView({
  data,
  isFullscreen = false,
}: TaskDetailViewProps) {
  const {
    name,
    description,
    priority,
    completed,
    startDate,
    endDate,
    createdAt,
    board,
    list,
    labels,
    assignees,
  } = data;

  const priorityStyle = priority ? priorityConfig[priority] : null;
  const dueDateInfo = getRelativeDate(endDate);

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Status Banner */}
      {completed && (
        <div className="flex items-center justify-center gap-2 bg-dynamic-green/10 px-4 py-2 text-dynamic-green">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium text-xs">Completed</span>
        </div>
      )}

      {/* Header with Task Name */}
      <div
        className={cn(
          'border-border/30 border-b px-4 py-4',
          !isFullscreen && 'pr-12'
        )}
      >
        <div className="flex items-start gap-3">
          {!completed && (
            <div className="mt-0.5">
              <Circle className="h-5 w-5 text-muted-foreground/60" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <h3
              className={cn(
                'font-semibold text-base leading-tight',
                completed && 'text-muted-foreground line-through'
              )}
            >
              {name}
            </h3>

            {/* Priority and Due Date Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {priorityStyle && (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-medium ring-1',
                    priorityStyle.bgColor,
                    priorityStyle.color,
                    priorityStyle.ringColor
                  )}
                >
                  {priorityStyle.label}
                </Badge>
              )}

              {endDate && dueDateInfo.text && (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-medium',
                    dueDateInfo.isOverdue &&
                      'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
                    dueDateInfo.isToday &&
                      'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                  )}
                >
                  {dueDateInfo.text}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div
        className={cn(
          'space-y-4 overflow-y-auto p-4',
          !isFullscreen && 'max-h-72'
        )}
      >
        {/* Description */}
        {description && (
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </div>
        )}

        {/* Dates Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="font-medium text-xs uppercase tracking-wide">
                Start
              </span>
            </div>
            <p className="mt-1 font-medium text-sm">{formatDate(startDate)}</p>
          </div>
          <div
            className={cn(
              'rounded-lg p-3',
              dueDateInfo.isOverdue ? 'bg-dynamic-red/10' : 'bg-muted/20'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-2',
                dueDateInfo.isOverdue
                  ? 'text-dynamic-red'
                  : 'text-muted-foreground'
              )}
            >
              <Calendar className="h-4 w-4" />
              <span className="font-medium text-xs uppercase tracking-wide">
                Due
              </span>
            </div>
            <p
              className={cn(
                'mt-1 font-medium text-sm',
                dueDateInfo.isOverdue && 'text-dynamic-red'
              )}
            >
              {formatDate(endDate)}
            </p>
          </div>
        </div>

        {/* Board/List Location */}
        {(board || list) && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/20 p-3">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {[board, list].filter(Boolean).join(' / ')}
            </span>
          </div>
        )}

        {/* Labels */}
        {labels.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span className="font-medium text-xs uppercase tracking-wide">
                Labels
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label, idx) => (
                <span
                  key={idx}
                  className="rounded-full px-2.5 py-1 font-medium text-xs shadow-sm"
                  style={{
                    backgroundColor: `${label.color}25`,
                    color: label.color,
                    border: `1px solid ${label.color}40`,
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assignees */}
        {assignees.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="font-medium text-xs uppercase tracking-wide">
                Assignees
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignees.map((assignee, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-full bg-muted/50 py-1 pr-3 pl-1"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-dynamic-blue to-dynamic-purple font-medium text-white text-xs">
                    {assignee.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm">{assignee.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-border/30 border-t bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Clock className="h-3 w-3" />
          <span>Created {formatDate(createdAt)}</span>
        </div>
      </div>
    </Card>
  );
}
