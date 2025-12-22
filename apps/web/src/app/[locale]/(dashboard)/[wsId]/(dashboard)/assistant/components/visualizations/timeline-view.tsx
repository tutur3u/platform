'use client';

import {
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { GanttTimelineVisualization } from '../../types/visualizations';

interface TimelineViewProps {
  data: GanttTimelineVisualization['data'];
  isFullscreen?: boolean;
  wsId?: string;
}

const statusConfig: Record<
  string,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    icon: typeof Circle;
  }
> = {
  not_started: {
    color: 'bg-muted-foreground/60',
    bgColor: 'bg-muted/30',
    borderColor: 'border-muted-foreground/20',
    label: 'Not started',
    icon: Circle,
  },
  active: {
    color: 'bg-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    borderColor: 'border-dynamic-blue/30',
    label: 'In Progress',
    icon: Clock,
  },
  done: {
    color: 'bg-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
    borderColor: 'border-dynamic-green/30',
    label: 'Completed',
    icon: CheckCircle2,
  },
  closed: {
    color: 'bg-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
    borderColor: 'border-dynamic-purple/30',
    label: 'Closed',
    icon: CheckCircle2,
  },
};

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

function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getDateStatus(dateString: string | null): {
  isOverdue: boolean;
  isToday: boolean;
  daysRemaining: number | null;
  label: string;
} {
  if (!dateString)
    return { isOverdue: false, isToday: false, daysRemaining: null, label: '' };
  const date = new Date(dateString);
  const now = new Date();

  const dateAtMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const todayAtMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const diffMs = dateAtMidnight.getTime() - todayAtMidnight.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return {
      isOverdue: true,
      isToday: false,
      daysRemaining: days,
      label: `${Math.abs(days)}d overdue`,
    };
  }
  if (days === 0) {
    return {
      isOverdue: false,
      isToday: true,
      daysRemaining: 0,
      label: 'Today',
    };
  }
  if (days === 1) {
    return {
      isOverdue: false,
      isToday: false,
      daysRemaining: 1,
      label: 'Tomorrow',
    };
  }
  if (days < 7) {
    return {
      isOverdue: false,
      isToday: false,
      daysRemaining: days,
      label: `${days}d left`,
    };
  }
  return {
    isOverdue: false,
    isToday: false,
    daysRemaining: days,
    label: `${days}d`,
  };
}

function getDurationLabel(
  startDate: string | null,
  endDate: string | null
): string {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return '1 day';
  if (days === 1) return '1 day';
  return `${days + 1} days`;
}

export function TimelineView({
  data,
  isFullscreen = false,
  wsId,
}: TimelineViewProps) {
  const { title, timeRange, tasks } = data;

  // Calculate position and width for each task
  const getTaskPosition = (
    startDate: string | null,
    endDate: string | null
  ) => {
    const rangeStart = new Date(timeRange.start);
    const rangeEnd = new Date(timeRange.end);

    const taskStart = startDate
      ? new Date(startDate)
      : new Date(timeRange.start);
    const taskEnd = endDate ? new Date(endDate) : taskStart;

    // Clamp to range
    const clampedStart = Math.max(taskStart.getTime(), rangeStart.getTime());
    const clampedEnd = Math.min(taskEnd.getTime(), rangeEnd.getTime());

    const rangeDuration = rangeEnd.getTime() - rangeStart.getTime();
    const left = ((clampedStart - rangeStart.getTime()) / rangeDuration) * 100;
    const width = Math.max(
      ((clampedEnd - clampedStart) / rangeDuration) * 100,
      3 // Minimum width of 3%
    );

    return { left, width };
  };

  // Generate date markers for the timeline header
  const generateDateMarkers = () => {
    const rangeStart = new Date(timeRange.start);
    const rangeEnd = new Date(timeRange.end);
    const rangeDuration = rangeEnd.getTime() - rangeStart.getTime();
    const dayCount = Math.round(rangeDuration / (1000 * 60 * 60 * 24));

    const markers: { date: Date; position: number; isToday: boolean }[] = [];

    // Calculate optimal marker count based on range
    const markerCount = Math.min(Math.max(Math.ceil(dayCount / 3), 4), 7);

    for (let i = 0; i <= markerCount; i++) {
      const date = new Date(
        rangeStart.getTime() + (rangeDuration * i) / markerCount
      );
      const today = new Date();
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      markers.push({
        date,
        position: (i / markerCount) * 100,
        isToday,
      });
    }
    return markers;
  };

  const dateMarkers = generateDateMarkers();

  // Calculate today's position on the timeline
  const getTodayPosition = () => {
    const rangeStart = new Date(timeRange.start);
    const rangeEnd = new Date(timeRange.end);
    const today = new Date();

    if (today < rangeStart || today > rangeEnd) return null;

    const rangeDuration = rangeEnd.getTime() - rangeStart.getTime();
    return ((today.getTime() - rangeStart.getTime()) / rangeDuration) * 100;
  };

  const todayPosition = getTodayPosition();

  // Calculate total duration
  const totalDays = Math.round(
    (new Date(timeRange.end).getTime() - new Date(timeRange.start).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  // Count tasks by status
  const statusCounts = tasks.reduce(
    (acc, task) => {
      const status = task.status || 'not_started';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
        {/* Header */}
        <div
          className={cn(
            'border-border/30 border-b bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5 px-4 py-3',
            !isFullscreen && 'pr-12'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/15">
                <CalendarClock className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-muted-foreground text-xs">
                  {totalDays} day span • {tasks.length} tasks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5 border-border/50 bg-background/50 font-medium text-xs"
              >
                <Calendar className="h-3 w-3" />
                {formatDateShort(timeRange.start)}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                {formatDateShort(timeRange.end)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Status Summary Bar */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-4 border-border/20 border-b bg-muted/10 px-4 py-2">
            {Object.entries(statusCounts).map(([status, count]) => {
              const config = statusConfig[status] ?? statusConfig.not_started!;
              const StatusIcon = config.icon;
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <StatusIcon
                    className={cn(
                      'h-3 w-3',
                      status === 'done' || status === 'closed'
                        ? 'text-dynamic-green'
                        : status === 'active'
                          ? 'text-dynamic-blue'
                          : 'text-muted-foreground'
                    )}
                  />
                  <span className="text-muted-foreground text-xs">
                    {count} {config.label.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline Content */}
        <div
          className={cn(
            'scrollbar-none overflow-y-auto',
            !isFullscreen && 'max-h-80'
          )}
        >
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
                <Calendar className="h-6 w-6 opacity-50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">No tasks scheduled</p>
                <p className="text-xs opacity-70">
                  Tasks with dates will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {/* Timeline Header with Date Markers */}
              <div className="relative mb-4 h-8 select-none">
                {/* Background track */}
                <div className="absolute inset-x-0 top-4 h-px bg-linear-to-r from-border/20 via-border/40 to-border/20" />

                {/* Date markers */}
                {dateMarkers.map((marker, i) => (
                  <div
                    key={i}
                    className="absolute flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${marker.position}%` }}
                  >
                    <span
                      className={cn(
                        'whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px]',
                        marker.isToday
                          ? 'bg-dynamic-orange/15 font-semibold text-dynamic-orange'
                          : 'text-muted-foreground'
                      )}
                    >
                      {formatDateShort(marker.date.toISOString())}
                    </span>
                    <div
                      className={cn(
                        'mt-0.5 h-2 w-px',
                        marker.isToday ? 'bg-dynamic-orange' : 'bg-border/60'
                      )}
                    />
                  </div>
                ))}

                {/* Today indicator line (if within range) */}
                {todayPosition !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-6 z-10 flex -translate-x-1/2 cursor-default flex-col items-center"
                        style={{ left: `${todayPosition}%` }}
                      >
                        <div className="h-full w-0.5 rounded-full bg-dynamic-orange shadow-dynamic-orange/50 shadow-sm" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange"
                    >
                      <span className="font-medium text-xs">Today</span>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Tasks */}
              <div className="space-y-2">
                {tasks.map((task) => {
                  const { left, width } = getTaskPosition(
                    task.startDate,
                    task.endDate
                  );
                  const taskStatus =
                    statusConfig[task.status] ?? statusConfig.not_started!;
                  const priority = task.priority
                    ? priorityConfig[task.priority]
                    : null;
                  const endDateStatus = getDateStatus(task.endDate);
                  const duration = getDurationLabel(
                    task.startDate,
                    task.endDate
                  );
                  const isCompleted =
                    task.status === 'done' || task.status === 'closed';

                  const taskClassName = cn(
                    'group relative block rounded-lg border p-3 transition-all duration-200',
                    taskStatus.bgColor,
                    taskStatus.borderColor,
                    wsId &&
                      'cursor-pointer hover:border-primary/30 hover:shadow-md hover:shadow-primary/5',
                    isCompleted && 'opacity-70'
                  );

                  const StatusIcon = taskStatus.icon;

                  const taskContent = (
                    <>
                      {/* Task Info Row */}
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          {/* Status Icon */}
                          <StatusIcon
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0',
                              task.status === 'done' || task.status === 'closed'
                                ? 'text-dynamic-green'
                                : task.status === 'active'
                                  ? 'text-dynamic-blue'
                                  : 'text-muted-foreground/60'
                            )}
                          />

                          <div className="min-w-0 flex-1">
                            {/* Task Name */}
                            <p
                              className={cn(
                                'font-medium text-sm leading-tight',
                                isCompleted && 'line-through opacity-70'
                              )}
                            >
                              {task.name}
                            </p>

                            {/* Meta Info */}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {priority && (
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 font-medium text-[10px]',
                                    priority.bgColor,
                                    priority.color
                                  )}
                                >
                                  {priority.label}
                                </span>
                              )}

                              {duration && (
                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  {duration}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Date & Status Info */}
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {/* Date range display */}
                          <div className="flex items-center gap-1 text-[10px]">
                            {task.startDate && (
                              <span className="text-muted-foreground">
                                {formatDateShort(task.startDate)}
                              </span>
                            )}
                            {task.startDate && task.endDate && (
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                            )}
                            {task.endDate && (
                              <span
                                className={cn(
                                  'font-medium',
                                  endDateStatus.isOverdue
                                    ? 'text-dynamic-red'
                                    : endDateStatus.isToday
                                      ? 'text-dynamic-orange'
                                      : 'text-muted-foreground'
                                )}
                              >
                                {formatDateShort(task.endDate)}
                              </span>
                            )}
                          </div>

                          {/* Due status badge */}
                          {endDateStatus.label && !isCompleted && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 border-0 px-1.5 py-0 text-[9px]',
                                endDateStatus.isOverdue
                                  ? 'bg-dynamic-red/15 text-dynamic-red'
                                  : endDateStatus.isToday
                                    ? 'bg-dynamic-orange/15 text-dynamic-orange'
                                    : 'bg-muted/50 text-muted-foreground'
                              )}
                            >
                              {endDateStatus.label}
                            </Badge>
                          )}
                        </div>

                        {/* Link indicator */}
                        {wsId && (
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>

                      {/* Timeline Bar */}
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
                        {/* Background grid */}
                        <div className="absolute inset-0 flex">
                          {dateMarkers.slice(0, -1).map((_, i) => (
                            <div
                              key={i}
                              className="border-border/5 border-r"
                              style={{
                                width: `${100 / (dateMarkers.length - 1)}%`,
                              }}
                            />
                          ))}
                        </div>

                        {/* Today line */}
                        {todayPosition !== null && (
                          <div
                            className="absolute top-0 bottom-0 z-10 w-px bg-dynamic-orange/60"
                            style={{ left: `${todayPosition}%` }}
                          />
                        )}

                        {/* Task progress bar */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'absolute top-0 h-full rounded-full transition-all duration-300',
                                'group-hover:brightness-110',
                                taskStatus.color,
                                isCompleted && 'opacity-50'
                              )}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                minWidth: '6px',
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="space-y-1">
                              <p className="font-medium">{task.name}</p>
                              {task.startDate && task.endDate && (
                                <p className="text-muted-foreground">
                                  {formatDateFull(task.startDate)} →{' '}
                                  {formatDateFull(task.endDate)}
                                </p>
                              )}
                              <p className="text-muted-foreground">
                                {taskStatus.label}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </>
                  );

                  if (wsId) {
                    return (
                      <Link
                        key={task.id}
                        href={`/${wsId}/tasks/${task.id}`}
                        target="_blank"
                        className={taskClassName}
                      >
                        {taskContent}
                      </Link>
                    );
                  }

                  return (
                    <div key={task.id} className={taskClassName}>
                      {taskContent}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Legend Footer */}
        <div className="border-border/30 border-t bg-muted/10 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            {Object.entries(statusConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={cn('h-2 w-2 rounded-full', config.color)} />
                <span className="text-muted-foreground">{config.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-0.5 rounded-full bg-dynamic-orange" />
              <span className="text-muted-foreground">Today</span>
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}
