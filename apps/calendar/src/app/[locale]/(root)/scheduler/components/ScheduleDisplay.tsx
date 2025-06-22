'use client';

import type { Event, Task, TaskPriority } from '@tuturuuu/ai/scheduling/types';
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
  LockIcon,
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
  tasks: Task[];
}

const getCategoryColor = (taskId: string) => {
  // We can't get category from events directly, so we'll use a simple color scheme based on task ID
  const hash = taskId.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  const colors = [
    'bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-700 border-blue-200 dark:border-blue-800',
    'bg-gradient-to-r from-green-500/10 to-emerald-600/10 text-green-700 border-green-200 dark:border-green-800',
    'bg-gradient-to-r from-orange-500/10 to-amber-600/10 text-orange-700 border-orange-200 dark:border-orange-800',
    'bg-gradient-to-r from-purple-500/10 to-pink-600/10 text-purple-700 border-purple-200 dark:border-purple-800',
    'bg-gradient-to-r from-red-500/10 to-rose-600/10 text-red-700 border-red-200 dark:border-red-800',
  ];

  return colors[Math.abs(hash) % colors.length];
};

const getPriorityColor = (priority: TaskPriority) => {
  switch (priority) {
    case 'critical':
      return 'bg-gradient-to-r from-red-500/10 to-rose-600/10 text-red-700 border-red-200 dark:border-red-800';
    case 'high':
      return 'bg-gradient-to-r from-orange-500/10 to-amber-600/10 text-orange-700 border-orange-200 dark:border-orange-800';
    case 'normal':
      return 'bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-700 border-blue-200 dark:border-blue-800';
    case 'low':
      return 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-gray-700 border-gray-200 dark:border-gray-800';
    default:
      return 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-gray-700 border-gray-200 dark:border-gray-800';
  }
};

const getPriorityIcon = (priority: TaskPriority) => {
  switch (priority) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚡';
    case 'normal':
      return '��';
    case 'low':
      return '📝';
    default:
      return '📋';
  }
};

export function ScheduleDisplay({ events, tasks }: ScheduleDisplayProps) {
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
    const lockedEvents = events.filter((e) => e.locked).length;

    // Priority statistics
    const priorityStats = events.reduce(
      (acc, event) => {
        const task = tasks.find((t) => t.id === event.taskId);
        if (task) {
          acc[task.priority] = (acc[task.priority] || 0) + 1;
        }
        return acc;
      },
      {} as Record<TaskPriority, number>
    );

    return {
      totalDuration,
      uniqueTasks,
      splitTasks,
      overdueEvents,
      lockedEvents,
      daysSpanned: Object.keys(groupedEvents).length,
      priorityStats,
    };
  }, [events, groupedEvents, tasks]);

  if (events.length === 0) {
    return (
      <Card className="border-0 bg-gradient-to-br from-white to-gray-50/50 shadow-lg dark:from-gray-900 dark:to-gray-800/50">
        <CardHeader className="pb-6">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                <CalendarIcon className="h-5 w-5" />
              </div>
              Your Schedule
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Optimized task schedule with intelligent splitting
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="py-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20">
              <SparklesIcon className="h-10 w-10 text-blue-500" />
            </div>
            <h3 className="mb-3 text-xl font-semibold">
              No Schedule Generated
            </h3>
            <p className="mx-auto max-w-md text-muted-foreground">
              Add tasks and click &quot;Generate Schedule&quot; to see your
              optimized timeline
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Schedule Overview */}
      <Card className="border-0 bg-gradient-to-br from-white to-gray-50/50 shadow-lg dark:from-gray-900 dark:to-gray-800/50">
        <CardHeader className="pb-6">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg">
                <TrendingUpIcon className="h-5 w-5" />
              </div>
              Schedule Overview
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Summary of your optimized schedule
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-8">
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-3xl font-bold text-transparent">
                {events.length}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Events
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-green-600 to-emerald-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.uniqueTasks}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Tasks
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-orange-600 to-amber-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.totalDuration.toFixed(1)}h
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Total Time
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-purple-600 to-pink-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.splitTasks}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Split Tasks
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-red-600 to-rose-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.priorityStats.critical || 0}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Critical
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-orange-600 to-amber-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.priorityStats.high || 0}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                High
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-indigo-600 to-blue-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.lockedEvents}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Locked
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-rose-600 to-pink-700 bg-clip-text text-3xl font-bold text-transparent">
                {scheduleStats.daysSpanned}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Days
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Timeline */}
      <Card className="border-0 bg-white shadow-lg dark:bg-gray-900">
        <CardHeader className="pb-6">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-3 text-xl font-bold">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                <CalendarIcon className="h-4 w-4" />
              </div>
              Schedule Timeline
            </CardTitle>
            <CardDescription className="text-base">
              Your optimized schedule organized by day
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {Object.entries(groupedEvents)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, dayEvents]) => {
                const dayDate = dayjs(date);
                const isToday = dayDate.isSame(dayjs(), 'day');
                const isTomorrow = dayDate.isSame(dayjs().add(1, 'day'), 'day');

                return (
                  <div
                    key={date}
                    className={`space-y-4 rounded-xl border-2 p-6 transition-all duration-200 ${
                      isToday
                        ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50 dark:border-blue-800 dark:from-blue-950/20 dark:to-purple-950/20'
                        : isTomorrow
                          ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:border-green-800 dark:from-green-950/20 dark:to-emerald-950/20'
                          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg ${
                            isToday
                              ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                              : isTomorrow
                                ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                                : 'bg-gradient-to-br from-gray-500 to-gray-600'
                          }`}
                        >
                          <CalendarIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">
                            {dayDate.format('dddd, MMMM D')}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {isToday
                              ? 'Today'
                              : isTomorrow
                                ? 'Tomorrow'
                                : dayDate.fromNow()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {dayEvents.length} event
                          {dayEvents.length !== 1 ? 's' : ''}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {dayEvents
                            .reduce(
                              (sum, event) =>
                                sum +
                                event.range.end.diff(
                                  event.range.start,
                                  'hour',
                                  true
                                ),
                              0
                            )
                            .toFixed(1)}{' '}
                          hours
                        </div>
                      </div>
                    </div>

                    {/* Events */}
                    <div className="space-y-3">
                      {dayEvents
                        .sort((a, b) => a.range.start.diff(b.range.start))
                        .map((event) => {
                          const task = tasks.find((t) => t.id === event.taskId);
                          const duration = event.range.end.diff(
                            event.range.start,
                            'hour',
                            true
                          );

                          return (
                            <div
                              key={event.id}
                              className={`group relative rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-lg ${
                                event.locked
                                  ? 'border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 dark:border-purple-800 dark:from-purple-950/20 dark:to-pink-950/20'
                                  : event.isPastDeadline
                                    ? 'border-red-200 bg-gradient-to-r from-red-50 to-rose-50 dark:border-red-800 dark:from-red-950/20 dark:to-rose-950/20'
                                    : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:from-blue-950/20 dark:hover:to-purple-950/20'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                                      <ClockIcon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="font-semibold">
                                        {event.name}
                                      </h4>
                                      <p className="text-sm text-muted-foreground">
                                        {event.range.start.format('HH:mm')} -{' '}
                                        {event.range.end.format('HH:mm')} (
                                        {duration.toFixed(1)}h)
                                      </p>
                                    </div>
                                  </div>

                                  {/* Tags */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      className={`${getCategoryColor(event.taskId)} px-2 py-1 text-xs font-semibold`}
                                    >
                                      {task?.category || 'Unknown'}
                                    </Badge>

                                    {task && (
                                      <Badge
                                        className={`${getPriorityColor(task.priority)} px-2 py-1 text-xs font-semibold`}
                                      >
                                        <span className="mr-1">
                                          {getPriorityIcon(task.priority)}
                                        </span>
                                        {task.priority}
                                      </Badge>
                                    )}

                                    {event.locked && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge
                                            variant="outline"
                                            className="border-purple-200 bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-600 dark:border-purple-800 dark:bg-purple-950/20"
                                          >
                                            <LockIcon className="mr-1 h-3 w-3" />
                                            Locked
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            This event is locked and cannot be
                                            moved
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}

                                    {event.isPastDeadline && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge
                                            variant="outline"
                                            className="border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 dark:border-red-800 dark:bg-red-950/20"
                                          >
                                            <AlertTriangleIcon className="mr-1 h-3 w-3" />
                                            Overdue
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            This event is scheduled past its
                                            deadline
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}

                                    {event.partNumber && event.totalParts && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge
                                            variant="outline"
                                            className="border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 dark:border-blue-800 dark:bg-blue-950/20"
                                          >
                                            Part {event.partNumber}/
                                            {event.totalParts}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            This is part {event.partNumber} of{' '}
                                            {event.totalParts} for this task
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </div>
                              </div>
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
