'use client';

import { Calendar } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { GanttTimelineVisualization } from '../../types/visualizations';

interface TimelineViewProps {
  data: GanttTimelineVisualization['data'];
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

export function TimelineView({ data }: TimelineViewProps) {
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
      4 // Minimum width of 4%
    );

    return { left, width };
  };

  return (
    <Card className="overflow-hidden border-border/50 bg-gradient-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="border-b border-border/30 bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs font-medium">
            {formatDateShort(timeRange.start)} -{' '}
            {formatDateShort(timeRange.end)}
          </span>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="max-h-80 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 opacity-50" />
            <span className="text-sm">No tasks with dates found</span>
          </div>
        ) : (
          <div className="space-y-3">
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

              return (
                <div key={task.id} className="group space-y-1.5">
                  {/* Task Name */}
                  <div className="flex items-center justify-between">
                    <p className="truncate text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                      {task.name}
                    </p>
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        status?.color ?? 'bg-gray-400'
                      )}
                    />
                  </div>

                  {/* Timeline Bar */}
                  <div className="relative h-6 w-full rounded-lg bg-muted/30">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 flex">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 border-r border-border/20 last:border-r-0"
                        />
                      ))}
                    </div>

                    {/* Task Bar */}
                    <div
                      className={cn(
                        'absolute top-1 h-4 rounded-md transition-all duration-300',
                        'group-hover:shadow-md group-hover:brightness-110',
                        status?.color ?? 'bg-gray-400',
                        priorityRing
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                      title={`${task.name}: ${task.startDate || 'No start'} - ${task.endDate || 'No end'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-border/30 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn('h-2.5 w-2.5 rounded-full', config.color)} />
              <span className="text-muted-foreground">{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
