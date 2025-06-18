'use client';

import type { Event } from '@tuturuuu/ai/scheduling/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  SparklesIcon,
  TrendingUpIcon,
} from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useMemo } from 'react';

dayjs.extend(relativeTime);

interface ScheduleDisplayProps {
  events: Event[];
}

const getCategoryColor = (taskId: string) => {
  // We can't get category from events directly, so we'll use a simple color scheme based on task ID
  const hash = taskId.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  const colors = [
    'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30',
    'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30',
    'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/30',
    'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/30',
    'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/30',
  ];

  return colors[Math.abs(hash) % colors.length];
};

export function ScheduleDisplay({ events }: ScheduleDisplayProps) {
  const groupedEvents = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        const date = event.range.start.format('YYYY-MM-DD');
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(event);
        return acc;
      },
      {} as Record<string, Event[]>
    );
  }, [events]);

  const scheduleStats = useMemo(() => {
    const totalDuration = events.reduce(
      (sum, event) =>
        sum + event.range.end.diff(event.range.start, 'hour', true),
      0
    );

    const uniqueTasks = new Set(events.map((e) => e.taskId)).size;
    const splitTasks = new Set(
      events
        .filter((e) => e.partNumber && e.partNumber > 1)
        .map((e) => e.taskId)
    ).size;

    const overdueEvents = events.filter((e) => e.isPastDeadline).length;

    return {
      totalDuration,
      uniqueTasks,
      splitTasks,
      overdueEvents,
      daysSpanned: Object.keys(groupedEvents).length,
    };
  }, [events, groupedEvents]);

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Your Schedule
          </CardTitle>
          <CardDescription>
            Optimized task schedule with intelligent splitting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <SparklesIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
            <h3 className="mb-2 text-lg font-semibold">
              No Schedule Generated
            </h3>
            <p className="text-muted-foreground">
              Add tasks and click &quot;Generate Schedule&quot; to see your
              optimized timeline
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUpIcon className="h-5 w-5" />
            Schedule Overview
          </CardTitle>
          <CardDescription>Summary of your optimized schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-blue">
                {events.length}
              </div>
              <div className="text-sm text-muted-foreground">Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-green">
                {scheduleStats.uniqueTasks}
              </div>
              <div className="text-sm text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-orange">
                {scheduleStats.totalDuration.toFixed(1)}h
              </div>
              <div className="text-sm text-muted-foreground">Total Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-purple">
                {scheduleStats.splitTasks}
              </div>
              <div className="text-sm text-muted-foreground">Split Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-pink">
                {scheduleStats.daysSpanned}
              </div>
              <div className="text-sm text-muted-foreground">Days</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Schedule Timeline
          </CardTitle>
          <CardDescription>
            Your tasks organized by day and time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedEvents)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, dailyEvents]) => {
                const sortedEvents = dailyEvents.sort((a, b) =>
                  a.range.start.diff(b.range.start)
                );

                const dayDuration = dailyEvents.reduce(
                  (sum, event) =>
                    sum + event.range.end.diff(event.range.start, 'hour', true),
                  0
                );

                return (
                  <div key={date} className="space-y-4">
                    {/* Day Header */}
                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {dayjs(date).format('dddd, MMMM D')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {dailyEvents.length} events • {dayDuration.toFixed(1)}{' '}
                          hours
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {dayjs(date).fromNow()}
                      </Badge>
                    </div>

                    {/* Events Timeline */}
                    <div className="space-y-3">
                      {sortedEvents.map((event, eventIndex) => {
                        const duration = event.range.end.diff(
                          event.range.start,
                          'hour',
                          true
                        );
                        const nextEvent = sortedEvents[eventIndex + 1];
                        const gap = nextEvent
                          ? nextEvent.range.start.diff(
                              event.range.end,
                              'minute'
                            )
                          : 0;

                        return (
                          <div key={event.id} className="space-y-2">
                            {/* Event Card */}
                            <div
                              className={`group relative rounded-lg border p-4 transition-all hover:shadow-sm ${
                                event.isPastDeadline
                                  ? 'border-destructive/30 bg-destructive/5'
                                  : 'hover:bg-accent/5'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  {/* Event Header */}
                                  <div className="flex items-center gap-3">
                                    {event.isPastDeadline && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <AlertTriangleIcon className="h-5 w-5 shrink-0 text-destructive" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            This task is scheduled past its
                                            deadline
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                    <h4 className="flex-1 font-medium">
                                      {event.name}
                                    </h4>
                                    {event.partNumber && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Part {event.partNumber}/
                                        {event.totalParts}
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Event Details */}
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <ClockIcon className="h-3 w-3" />
                                      {event.range.start.format('HH:mm')} -{' '}
                                      {event.range.end.format('HH:mm')}
                                    </span>
                                    <span>{duration.toFixed(1)}h</span>
                                    <Badge
                                      className={getCategoryColor(event.taskId)}
                                    >
                                      {event.taskId.split('-')[0]}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Gap Indicator */}
                            {gap > 0 && (
                              <div className="flex items-center justify-center py-2">
                                <div className="flex items-center gap-2 rounded-full bg-accent/30 px-3 py-1 text-xs text-muted-foreground">
                                  <ClockIcon className="h-3 w-3" />
                                  <span>{gap} minute break</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
