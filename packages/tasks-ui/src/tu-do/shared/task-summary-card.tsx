'use client';

import { ArrowUpRight, Calendar, Circle } from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import {
  getAssigneeInitials,
  getCardColorClasses,
} from '../utils/taskColorUtils';
import { PRIORITY_BADGE_COLORS } from '../utils/taskConstants';
import { getPriorityIcon } from '../utils/taskPriorityUtils';
import type { TaskLabel } from './label-chip';
import { TaskEstimationDisplay } from './task-estimation-display';
import { TaskLabelsDisplay } from './task-labels-display';

interface TaskSummaryCardProps {
  title: string;
  href?: string;
  source?: string;
  listName?: string;
  priority?: TaskPriority;
  priorityLabel?: string;
  date?: string;
  dateLabel: string;
  overdue?: boolean;
  estimationPoints?: number;
  estimationType?: string;
  estimationLabel?: string;
  labels?: TaskLabel[];
  assignees?: { id: string; name: string; avatarUrl?: string }[];
}

/** Compact read-only counterpart to the board card, using the same metadata. */
export function TaskSummaryCard({
  title,
  href,
  source,
  listName,
  priority,
  priorityLabel,
  date,
  dateLabel,
  overdue,
  estimationPoints,
  estimationType,
  estimationLabel,
  labels,
  assignees,
}: TaskSummaryCardProps) {
  const Card = href ? 'a' : 'article';
  return (
    <Card
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noreferrer' : undefined}
      className={cn(
        'group relative block h-full space-y-2 overflow-hidden rounded-lg border border-l-4 bg-background p-2.5 shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/30',
        getCardColorClasses(undefined, priority)
      )}
    >
      {(source || listName) && (
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          {listName && (
            <Badge
              variant="outline"
              className="h-5 max-w-[50%] gap-1 px-1.5 text-[10px]"
            >
              <Circle aria-hidden className="size-2.5 shrink-0" />
              <span className="truncate">{listName}</span>
            </Badge>
          )}
          {source && (
            <span className="min-w-0 truncate" title={source}>
              {source}
            </span>
          )}
        </div>
      )}
      <h3 className="flex items-start gap-2 font-medium text-sm leading-snug">
        <span className="line-clamp-2 flex-1">{title}</span>
        {href && (
          <ArrowUpRight
            aria-hidden
            className="mt-0.5 size-3 shrink-0 text-muted-foreground"
          />
        )}
      </h3>
      <div
        className={cn(
          'flex items-center gap-1 text-[11px] text-muted-foreground',
          overdue && 'text-destructive'
        )}
      >
        <Calendar aria-hidden className="size-3 shrink-0" />
        {date ? (
          <time dateTime={date}>{dateLabel}</time>
        ) : (
          <span>{dateLabel}</span>
        )}
      </div>
      {priority ||
      estimationPoints != null ||
      labels?.length ||
      assignees?.length ? (
        <div className="flex flex-wrap items-center gap-1">
          {priority && (
            <Badge
              variant="outline"
              className={cn(
                'h-5.5 gap-1 px-1 text-[10px]',
                PRIORITY_BADGE_COLORS[priority]
              )}
            >
              {getPriorityIcon(priority, 'size-3')}
              {priorityLabel}
            </Badge>
          )}
          <TaskEstimationDisplay
            points={estimationPoints}
            estimationType={estimationType}
            tooltipLabel={estimationLabel}
          />
          <TaskLabelsDisplay labels={labels} className="contents" />
          {!!assignees?.length && (
            <div className="ml-auto flex -space-x-1.5 pl-2">
              {assignees.map((person) => (
                <Avatar
                  key={person.id}
                  className="size-5.5 border-2 border-background"
                  title={person.name}
                >
                  <AvatarImage src={person.avatarUrl} alt={person.name} />
                  <AvatarFallback className="text-[8px]">
                    {getAssigneeInitials(person.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}
