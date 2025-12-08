import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  Sparkles,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskWithScheduling } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

type TaskSchedulerPanelProps = {
  wsId: string;
  userId: string;
  onEventCreated?: () => void;
};

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

async function fetchSchedulableTasks(
  userId: string,
  searchQuery?: string
): Promise<TaskWithScheduling[]> {
  const supabase = createClient();

  // Fetch tasks assigned to user that have duration set
  let query = supabase
    .from('task_assignees')
    .select(
      `
      ...tasks!inner(
        *
      )
    `
    )
    .eq('user_id', userId)
    .gt('tasks.total_duration', 0);

  if (searchQuery?.trim()) {
    query = query.ilike('tasks.name', `%${searchQuery}%`);
  }

  const { data: assignedTasks, error } = await query;

  if (error) {
    console.error('Error fetching schedulable tasks:', error);
    return [];
  }

  // Fetch scheduled events for these tasks
  const taskIds = assignedTasks?.map((t: any) => t.id) || [];

  if (taskIds.length === 0) {
    return [];
  }

  // Query scheduled minutes from both sources:
  // 1. task_calendar_events junction table (for detailed tracking)
  // 2. workspace_calendar_events with task_id (for direct reference)

  // First, try the junction table
  const { data: junctionEvents } = await (supabase as any)
    .from('task_calendar_events')
    .select('task_id, scheduled_minutes, completed')
    .in('task_id', taskIds);

  // Also query directly from calendar events with task_id
  const { data: directEvents } = await supabase
    .from('workspace_calendar_events')
    .select('task_id, start_at, end_at')
    .in('task_id', taskIds)
    .not('task_id', 'is', null);

  // Calculate scheduled and completed minutes per task
  const taskSchedulingMap = new Map<
    string,
    { scheduled_minutes: number; completed_minutes: number }
  >();

  type TaskEventRow = {
    task_id: string;
    scheduled_minutes: number;
    completed: boolean;
  };

  // Process junction table events
  (junctionEvents as TaskEventRow[] | null)?.forEach((event) => {
    const current = taskSchedulingMap.get(event.task_id) || {
      scheduled_minutes: 0,
      completed_minutes: 0,
    };
    current.scheduled_minutes += event.scheduled_minutes || 0;
    if (event.completed) {
      current.completed_minutes += event.scheduled_minutes || 0;
    }
    taskSchedulingMap.set(event.task_id, current);
  });

  // Process direct calendar events (fallback for when junction insert fails)
  type DirectEventRow = {
    task_id: string;
    start_at: string;
    end_at: string;
  };

  (directEvents as DirectEventRow[] | null)?.forEach((event) => {
    const taskId = event.task_id;
    if (!taskId) return;

    // Calculate duration from event times
    const startAt = new Date(event.start_at);
    const endAt = new Date(event.end_at);
    const scheduledMinutes = Math.round(
      (endAt.getTime() - startAt.getTime()) / 60000
    );

    // Check if already counted from junction table
    const current = taskSchedulingMap.get(taskId);
    if (!current || current.scheduled_minutes === 0) {
      // Only add if not already tracked via junction
      taskSchedulingMap.set(taskId, {
        scheduled_minutes: scheduledMinutes,
        completed_minutes: 0,
      });
    }
  });

  // Merge scheduling info into tasks
  return (assignedTasks || []).map((task: any) => {
    const scheduling = taskSchedulingMap.get(task.id) || {
      scheduled_minutes: 0,
      completed_minutes: 0,
    };
    return {
      ...task,
      scheduled_minutes: scheduling.scheduled_minutes,
      completed_minutes: scheduling.completed_minutes,
    };
  });
}

export function TaskSchedulerPanel({
  wsId,
  userId,
  onEventCreated,
}: TaskSchedulerPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);

  const {
    data: tasks = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['schedulable-tasks', userId, searchQuery],
    queryFn: () => fetchSchedulableTasks(userId, searchQuery),
    staleTime: 30000,
  });

  const handleScheduleTask = async (task: TaskWithScheduling) => {
    if (schedulingTaskId) return;

    setSchedulingTaskId(task.id);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${task.id}/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to schedule task');
      }

      await refetch();
      onEventCreated?.();
    } catch (error) {
      console.error('Error scheduling task:', error);
    } finally {
      setSchedulingTaskId(null);
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            <span className="font-medium text-sm">Task Scheduler</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {totalTasks} tasks
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* Summary Stats */}
        <div className="flex gap-2 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="cursor-help bg-dynamic-green/10 text-dynamic-green"
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
                className="cursor-help bg-dynamic-yellow/10 text-dynamic-yellow"
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
                className="cursor-help bg-muted text-muted-foreground"
              >
                {unscheduledTasks} unscheduled
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Not yet scheduled</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Task List */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
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
          ) : (
            tasks.map((task) => (
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
        <div className="border-t p-3">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            disabled={schedulingTaskId !== null}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
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
  const totalMinutes = (task.total_duration ?? 0) * 60;
  const scheduledMinutes = task.scheduled_minutes ?? 0;
  const progress =
    totalMinutes > 0 ? (scheduledMinutes / totalMinutes) * 100 : 0;
  const isFullyScheduled = progress >= 100;
  const hasScheduled = scheduledMinutes > 0;

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
        'group rounded-md border p-2.5 transition-colors',
        isFullyScheduled
          ? 'border-dynamic-green/30 bg-dynamic-green/5'
          : 'cursor-grab border-border hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate font-medium text-sm',
              isFullyScheduled && 'text-muted-foreground'
            )}
          >
            {task.name || 'Untitled Task'}
          </p>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(totalMinutes)}
            </span>
            {task.is_splittable && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                Splittable
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
      {totalMinutes > 0 && (
        <div className="mt-2 space-y-1">
          <Progress
            value={progress}
            className={cn('h-1.5', isFullyScheduled && 'bg-dynamic-green/20')}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {formatDuration(scheduledMinutes)} /{' '}
              {formatDuration(totalMinutes)}
            </span>
            {hasScheduled && !isFullyScheduled && (
              <span className="text-dynamic-yellow">
                {formatDuration(totalMinutes - scheduledMinutes)} remaining
              </span>
            )}
            {isFullyScheduled && (
              <span className="flex items-center gap-0.5 text-dynamic-green">
                <CheckCircle className="h-3 w-3" />
                Scheduled
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
