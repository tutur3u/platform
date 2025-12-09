'use client';

import { Calendar, CalendarClock } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { GanttTimelineVisualization } from '../../types/visualizations';

interface TimelineViewProps {
  data: GanttTimelineVisualization['data'];
  isFullscreen?: boolean;
}

const statusConfig: Record<
  string,
  { color: string; bgColor: string; label: string }
> = {
  not_started: {
    color: 'bg-gray-400',
    bgColor: 'bg-gray-400/20',
    label: 'Not started',
  },
  active: {
    color: 'bg-dynamic-blue',
    bgColor: 'bg-dynamic-blue/20',
    label: 'Active',
  },
  done: {
    color: 'bg-dynamic-green',
    bgColor: 'bg-dynamic-green/20',
    label: 'Done',
  },
  closed: {
    color: 'bg-dynamic-purple',
    bgColor: 'bg-dynamic-purple/20',
    label: 'Closed',
  },
};

const priorityIndicator: Record<string, string> = {
  critical: 'ring-2 ring-dynamic-red/50',
  high: 'ring-2 ring-dynamic-orange/50',
  normal: '',
  low: 'opacity-70',
};

function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateStatus(dateString: string | null): {
  isOverdue: boolean;
  isToday: boolean;
  isPast: boolean;
} {
  if (!dateString) return { isOverdue: false, isToday: false, isPast: false };
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

  return {
    isOverdue: days < 0,
    isToday: days === 0,
    isPast: days < 0,
  };
}

export function TimelineView({
  data,
  isFullscreen = false,
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
      2 // Minimum width of 2%
    );

    return { left, width };
  };

  // Generate date markers for the timeline header
  const generateDateMarkers = () => {
    const rangeStart = new Date(timeRange.start);
    const rangeEnd = new Date(timeRange.end);
    const rangeDuration = rangeEnd.getTime() - rangeStart.getTime();
    const dayCount = rangeDuration / (1000 * 60 * 60 * 24);

    const markers: { date: Date; position: number }[] = [];
    const markerCount = Math.min(Math.max(Math.ceil(dayCount / 7), 3), 5);

    for (let i = 0; i <= markerCount; i++) {
      const date = new Date(
        rangeStart.getTime() + (rangeDuration * i) / markerCount
      );
      markers.push({
        date,
        position: (i / markerCount) * 100,
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

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div
        className={cn(
          'border-border/30 border-b bg-muted/20 px-4 py-3',
          !isFullscreen && 'pr-12'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            {formatDateShort(timeRange.start)} –{' '}
            {formatDateShort(timeRange.end)}
          </span>
        </div>
      </div>

      {/* Timeline Content */}
      <div
        className={cn(
          'overflow-y-auto scrollbar-none p-4',
          !isFullscreen && 'max-h-80'
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 opacity-50" />
            <span className="text-sm">No tasks with dates found</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Timeline Header with Date Markers */}
            <div className="relative mb-6 h-6">
              <div className="absolute inset-x-0 top-1/2 h-px bg-border/40" />
              {dateMarkers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${marker.position}%` }}
                >
                  <div className="h-2 w-px bg-border/60" />
                  <span className="mt-1 whitespace-nowrap text-muted-foreground text-[10px]">
                    {formatDateShort(marker.date.toISOString())}
                  </span>
                </div>
              ))}
              {/* Today marker */}
              {todayPosition !== null && (
                <div
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${todayPosition}%` }}
                >
                  <div className="h-3 w-0.5 rounded-full bg-dynamic-orange" />
                  <span className="mt-0.5 whitespace-nowrap rounded bg-dynamic-orange/20 px-1 font-medium text-[9px] text-dynamic-orange">
                    Today
                  </span>
                </div>
              )}
            </div>

            {/* Tasks */}
            {tasks.map((task) => {
              const { left, width } = getTaskPosition(
                task.startDate,
                task.endDate
              );
              const status =
                statusConfig[task.status] ?? statusConfig.not_started;
              const priorityRing = task.priority
                ? priorityIndicator[task.priority]
                : '';
              const endDateStatus = getDateStatus(task.endDate);
              const hasDateRange = task.startDate && task.endDate;

              return (
                <div key={task.id} className="group space-y-1">
                  {/* Task Name and Dates Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          status?.color ?? 'bg-gray-400'
                        )}
                      />
                      <p className="truncate font-medium text-foreground/80 text-xs transition-colors group-hover:text-foreground">
                        {task.name}
                      </p>
                    </div>
                    {/* Date Range Display */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {hasDateRange ? (
                        <>
                          <span className="text-muted-foreground text-[10px]">
                            {formatDateShort(task.startDate!)}
                          </span>
                          <span className="text-muted-foreground/50 text-[10px]">
                            →
                          </span>
                          <span
                            className={cn(
                              'text-[10px]',
                              endDateStatus.isOverdue
                                ? 'font-medium text-dynamic-red'
                                : endDateStatus.isToday
                                  ? 'font-medium text-dynamic-orange'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {formatDateShort(task.endDate!)}
                          </span>
                        </>
                      ) : task.endDate ? (
                        <span
                          className={cn(
                            'text-[10px]',
                            endDateStatus.isOverdue
                              ? 'font-medium text-dynamic-red'
                              : endDateStatus.isToday
                                ? 'font-medium text-dynamic-orange'
                                : 'text-muted-foreground'
                          )}
                        >
                          Due {formatDateShort(task.endDate)}
                        </span>
                      ) : task.startDate ? (
                        <span className="text-muted-foreground text-[10px]">
                          Starts {formatDateShort(task.startDate)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Timeline Bar */}
                  <div className="relative h-5 w-full rounded-md bg-muted/20">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 flex">
                      {dateMarkers.slice(0, -1).map((_, i) => (
                        <div
                          key={i}
                          className="border-border/10 border-r"
                          style={{
                            width: `${100 / (dateMarkers.length - 1)}%`,
                          }}
                        />
                      ))}
                    </div>

                    {/* Today line on task bar */}
                    {todayPosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-dynamic-orange/40"
                        style={{ left: `${todayPosition}%` }}
                      />
                    )}

                    {/* Task Bar */}
                    <div
                      className={cn(
                        'absolute top-0.5 h-4 rounded transition-all duration-300',
                        'group-hover:shadow-md group-hover:brightness-110',
                        status?.color ?? 'bg-gray-400',
                        priorityRing
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: '4px',
                      }}
                    >
                      {/* Start marker */}
                      {task.startDate && width > 8 && (
                        <div className="absolute top-1/2 left-0.5 h-2 w-0.5 -translate-y-1/2 rounded-full bg-white/60" />
                      )}
                      {/* End marker */}
                      {task.endDate && width > 8 && (
                        <div className="absolute top-1/2 right-0.5 h-2 w-0.5 -translate-y-1/2 rounded-full bg-white/60" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-border/30 border-t bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn('h-2.5 w-2.5 rounded-full', config.color)} />
              <span className="text-muted-foreground">{config.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-0.5 rounded-full bg-dynamic-orange" />
            <span className="text-muted-foreground">Today</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
