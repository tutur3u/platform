import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  Sparkles,
} from '@tuturuuu/icons';
import {
  applyWorkspaceCalendarSchedule,
  listWorkspaceSchedulableTasks,
} from '@tuturuuu/internal-api';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { Badge } from '../../badge';
import { Button } from '../../button';
import { Input } from '../../input';
import { Progress } from '../../progress';
import { ScrollArea } from '../../scroll-area';
import { toast } from '../../sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

type TaskSchedulerPanelProps = {
  wsId: string;
  userId: string;
  onEventCreated?: () => void;
  /**
   * Personal calendar mode:
   * - scheduling creates events in the current user's personal workspace calendar
   * - progress counts only events in that personal calendar
   */
  isPersonalWorkspace?: boolean;
};

type TaskScheduleState = 'unscheduled' | 'partial' | 'scheduled';

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getTaskScheduleState(task: TaskWithScheduling): TaskScheduleState {
  const totalMinutes = Math.max(0, (task.total_duration ?? 0) * 60);
  const scheduledMinutes = Math.max(0, task.scheduled_minutes ?? 0);

  if (totalMinutes > 0 && scheduledMinutes >= totalMinutes) {
    return 'scheduled';
  }

  if (scheduledMinutes > 0) {
    return 'partial';
  }

  return 'unscheduled';
}

async function fetchSchedulableTasks(
  _userId: string,
  calendarWsId: string,
  _isPersonalWorkspace: boolean,
  searchQuery?: string
): Promise<TaskWithScheduling[]> {
  try {
    const result = await listWorkspaceSchedulableTasks(
      calendarWsId,
      searchQuery?.trim() ? { q: searchQuery.trim() } : undefined,
      {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      }
    );

    return result.tasks ?? [];
  } catch (error) {
    console.error('Error fetching schedulable tasks:', error);
    return [];
  }
}

export function TaskSchedulerPanel({
  wsId,
  userId,
  onEventCreated,
  isPersonalWorkspace = false,
}: TaskSchedulerPanelProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [isSchedulingAll, setIsSchedulingAll] = useState(false);

  const {
    data: tasks = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'schedulable-tasks',
      userId,
      wsId,
      isPersonalWorkspace,
      searchQuery,
    ],
    queryFn: () =>
      fetchSchedulableTasks(userId, wsId, isPersonalWorkspace, searchQuery),
    staleTime: 30000,
  });

  const actionableTasks = tasks
    .filter((task) => getTaskScheduleState(task) !== 'scheduled')
    .sort((left, right) => {
      const leftState = getTaskScheduleState(left);
      const rightState = getTaskScheduleState(right);
      const stateWeight: Record<TaskScheduleState, number> = {
        partial: 0,
        unscheduled: 1,
        scheduled: 2,
      };

      if (stateWeight[leftState] !== stateWeight[rightState]) {
        return stateWeight[leftState] - stateWeight[rightState];
      }

      return (left.name || '').localeCompare(right.name || '');
    });

  const refreshSchedulingViews = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['schedulable-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['scheduled-events-batch'] }),
      queryClient.invalidateQueries({ queryKey: ['task-schedule-batch'] }),
      queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', wsId],
      }),
    ]);
  };

  const handleScheduleTask = async (task: TaskWithScheduling) => {
    if (schedulingTaskId) return;

    setSchedulingTaskId(task.id);

    try {
      const response = await fetch(
        isPersonalWorkspace
          ? `/api/v1/users/me/tasks/${task.id}/schedule`
          : `/api/v1/workspaces/${wsId}/tasks/${task.id}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to schedule task');
      }

      await refreshSchedulingViews();
      onEventCreated?.();
    } catch (error) {
      console.error('Error scheduling task:', error);
    } finally {
      setSchedulingTaskId(null);
    }
  };

  const handleScheduleAll = async () => {
    if (isSchedulingAll || schedulingTaskId) return;

    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setIsSchedulingAll(true);

    try {
      const result = await applyWorkspaceCalendarSchedule<{
        summary?: { eventsCreated?: number };
        events?: Array<{ id: string }>;
      }>(
        wsId,
        {
          windowDays: 30,
          clientTimezone,
          mode: 'full-apply',
          scope: 'impacted-only',
        },
        {
          fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
        }
      );

      toast.success(`Scheduled ${result.summary?.eventsCreated ?? 0} events`);
      await refreshSchedulingViews();
      onEventCreated?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to schedule tasks'
      );
    } finally {
      setIsSchedulingAll(false);
    }
  };

  // Calculate summary stats
  const totalTasks = tasks.length;
  const fullyScheduledTasks = tasks.filter((task) => {
    const totalMinutes = (task.total_duration ?? 0) * 60;
    return totalMinutes > 0 && (task.scheduled_minutes ?? 0) >= totalMinutes;
  }).length;
  const partiallyScheduledTasks = tasks.filter((task) => {
    const totalMinutes = (task.total_duration ?? 0) * 60;
    const scheduledMinutes = task.scheduled_minutes ?? 0;
    return (
      totalMinutes > 0 &&
      scheduledMinutes > 0 &&
      scheduledMinutes < totalMinutes
    );
  }).length;
  const unscheduledTasks =
    totalTasks - fullyScheduledTasks - partiallyScheduledTasks;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="w-full shrink-0 space-y-3 overflow-hidden border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            <span className="font-medium text-sm">Task Scheduler</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {totalTasks} tasks
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Showing only tasks that still need time on the calendar.
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* Summary Stats */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="shrink-0 cursor-help bg-dynamic-green/10 text-dynamic-green"
              >
                <CheckCircle className="mr-1 h-3 w-3" />
                {fullyScheduledTasks}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Fully scheduled</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="shrink-0 cursor-help bg-dynamic-yellow/10 text-dynamic-yellow"
              >
                <Clock className="mr-1 h-3 w-3" />
                {partiallyScheduledTasks}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Partially scheduled</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="shrink-0 cursor-help bg-muted text-muted-foreground"
              >
                {unscheduledTasks} pending
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Not yet scheduled</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Task List */}
      <ScrollArea className="w-full flex-1">
        <div className="w-full space-y-1 p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {searchQuery
                ? 'No tasks match your search'
                : 'No tasks with duration set'}
            </div>
          ) : actionableTasks.length === 0 ? (
            <div className="space-y-1 py-8 text-center">
              <p className="font-medium text-sm">Everything is scheduled</p>
              <p className="text-muted-foreground text-xs">
                Smart Queue will show tasks here when they need more time.
              </p>
            </div>
          ) : (
            actionableTasks.map((task) => (
              <TaskSchedulerItem
                key={task.id}
                task={task}
                onSchedule={() => handleScheduleTask(task)}
                isScheduling={schedulingTaskId === task.id}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Batch Schedule Button */}
      {unscheduledTasks > 0 && (
        <div className="w-full shrink-0 border-t p-3">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            disabled={schedulingTaskId !== null || isSchedulingAll}
            onClick={handleScheduleAll}
          >
            {isSchedulingAll ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Schedule All ({unscheduledTasks})
          </Button>
        </div>
      )}
    </div>
  );
}

type TaskSchedulerItemProps = {
  task: TaskWithScheduling;
  onSchedule: () => void;
  isScheduling: boolean;
};

function TaskSchedulerItem({
  task,
  onSchedule,
  isScheduling,
}: TaskSchedulerItemProps) {
  const rawTotalMinutes = (task.total_duration ?? 0) * 60;
  const scheduledMinutes = task.scheduled_minutes ?? 0;
  // Use max of scheduled and total to handle over-scheduling gracefully
  const displayTotalMinutes = Math.max(rawTotalMinutes, scheduledMinutes);
  const progress =
    displayTotalMinutes > 0
      ? Math.min((scheduledMinutes / displayTotalMinutes) * 100, 100)
      : 0;
  const isFullyScheduled = scheduledMinutes >= rawTotalMinutes;
  const hasScheduled = scheduledMinutes > 0;
  const status = getTaskScheduleState(task);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Set drag data for calendar drop zone
    const dragData = {
      type: 'task',
      taskId: task.id,
      taskName: task.name || 'Untitled Task',
      totalDuration: task.total_duration ?? 0, // in hours
      priority: task.priority,
      listId: task.list_id,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';

    // Add a custom drag image (optional enhancement)
    const dragElement = e.currentTarget;
    dragElement.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Reset opacity after drag
    e.currentTarget.style.opacity = '1';
  };

  return (
    <div
      draggable={!isFullyScheduled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        'group w-full min-w-0 overflow-hidden rounded-md border p-2.5 transition-colors',
        isFullyScheduled
          ? 'border-dynamic-green/30 bg-dynamic-green/5'
          : 'cursor-grab border-border hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn(
              'truncate font-medium text-sm',
              isFullyScheduled && 'text-muted-foreground'
            )}
          >
            {task.name || 'Untitled Task'}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-muted-foreground text-xs">
            <span className="flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(displayTotalMinutes)}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                'h-4 shrink-0 px-1 text-[10px]',
                status === 'partial' &&
                  'bg-dynamic-yellow/10 text-dynamic-yellow',
                status === 'unscheduled' && 'bg-muted text-muted-foreground'
              )}
            >
              {status === 'partial' ? 'Partially scheduled' : 'Needs time'}
            </Badge>
            {task.is_splittable && (
              <Badge
                variant="outline"
                className="h-4 shrink-0 px-1 text-[10px]"
              >
                Split
              </Badge>
            )}
          </div>
        </div>

        {!isFullyScheduled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onSchedule}
            disabled={isScheduling}
          >
            {isScheduling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Progress Bar */}
      {displayTotalMinutes > 0 && (
        <div className="mt-2 space-y-1">
          <Progress
            value={progress}
            className={cn('h-1.5', isFullyScheduled && 'bg-dynamic-green/20')}
          />
          <div className="flex min-w-0 items-center justify-between gap-1 text-[10px] text-muted-foreground">
            <span className="shrink-0">
              {formatDuration(scheduledMinutes)}/
              {formatDuration(displayTotalMinutes)}
            </span>
            {hasScheduled && !isFullyScheduled && (
              <span className="truncate text-dynamic-yellow">
                {formatDuration(rawTotalMinutes - scheduledMinutes)} left
              </span>
            )}
            {isFullyScheduled && (
              <span className="flex shrink-0 items-center gap-0.5 text-dynamic-green">
                <CheckCircle className="h-3 w-3" />
                Done
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
