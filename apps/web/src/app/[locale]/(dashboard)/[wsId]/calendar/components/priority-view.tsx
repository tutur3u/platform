'use client';

import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from '@tuturuuu/icons';
import {
  Briefcase,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  horseHead,
  Icon,
  Loader2,
  Plus,
  Rabbit,
  Scissors,
  Search,
  Turtle,
  User,
  unicornHead,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { Progress } from '@tuturuuu/ui/progress';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTaskDialog } from '@tuturuuu/ui/tu-do/hooks/useTaskDialog';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import ActionsDropdown from './actions-dropdown';
import PriorityDropdown from './priority-dropdown';
import { QuickTaskDialog } from './quick-task-dialog';
import { SchedulingDialog } from './scheduling-dialog';
import { getAssignedTasks } from './task-fetcher';

// Priority labels (matching task-properties-section.tsx)
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

// Priority icons (matching taskPriorityUtils.tsx)
const PRIORITY_ICONS: Record<TaskPriority, React.ReactElement> = {
  critical: <Icon iconNode={unicornHead} />,
  high: <Icon iconNode={horseHead} />,
  normal: <Rabbit />,
  low: <Turtle />,
};

function getPriorityIcon(
  priority: TaskPriority | null | undefined,
  className?: string
): React.ReactNode {
  if (!priority) return null;
  const icon = PRIORITY_ICONS[priority];
  return icon ? React.cloneElement(icon, { className } as any) : null;
}

// Priority order for grouping (highest to lowest)
const PRIORITY_ORDER = ['critical', 'high', 'normal', 'low'] as const;

// Priority group styling
const PRIORITY_GROUP_COLORS: Record<string, string> = {
  critical: 'from-dynamic-red/20 to-dynamic-red/30 border-dynamic-red/30',
  high: 'from-dynamic-orange/20 to-dynamic-orange/30 border-dynamic-orange/30',
  normal:
    'from-dynamic-yellow/20 to-dynamic-yellow/30 border-dynamic-yellow/30',
  low: 'from-dynamic-blue/20 to-dynamic-blue/30 border-dynamic-blue/30',
};

// Calendar hours type icons
const CALENDAR_HOURS_ICONS: Record<
  string,
  { icon: LucideIcon; label: string }
> = {
  work_hours: { icon: Briefcase, label: 'Work Hours' },
  meeting_hours: { icon: Calendar, label: 'Meeting Hours' },
  personal_hours: { icon: User, label: 'Personal Hours' },
};

// Format duration helper
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export default function PriorityView({
  wsId,
  allTasks,
  assigneeId,
  isPersonalWorkspace = false,
}: {
  wsId: string;
  allTasks: ExtendedWorkspaceTask[];
  assigneeId: string;
  /** If true, skip auto-assignment (personal workspace) */
  isPersonalWorkspace?: boolean;
}) {
  const router = useRouter();
  const { openTaskById, onUpdate } = useTaskDialog();
  const { setOnTaskScheduled } = useCalendar();

  // Register callback to refresh data when a task is scheduled via drag-drop
  useEffect(() => {
    setOnTaskScheduled(() => {
      router.refresh();
    });
    return () => setOnTaskScheduled(undefined);
  }, [setOnTaskScheduled, router]);

  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<ExtendedWorkspaceTask[]>(
    []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Use search results when searching, otherwise use all tasks
  const combinedTasks = search.trim() ? searchResults : allTasks;

  // Group tasks by priority
  const grouped = useMemo(() => {
    const groups: { [key: string]: ExtendedWorkspaceTask[] } = {
      critical: [],
      high: [],
      normal: [],
      low: [],
    };

    combinedTasks.forEach((task) => {
      const priority = task.priority || 'normal';
      if (groups[priority]) {
        groups[priority].push(task);
      } else {
        groups.normal?.push(task);
      }
    });

    return groups;
  }, [combinedTasks]);

  // Initialize collapsed state - collapse empty groups by default
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const emptyGroups = new Set<string>();
    PRIORITY_ORDER.forEach((key) => {
      const taskCount = allTasks.filter(
        (t) => (t.priority || 'normal') === key
      ).length;
      if (taskCount === 0) {
        emptyGroups.add(key);
      }
    });
    return emptyGroups;
  });

  // Track manually collapsed groups (to not auto-expand them)
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(
    new Set()
  );

  // Track previous task counts to detect changes
  const prevGroupedRef = React.useRef<{ [key: string]: number }>({});

  // Auto-collapse empty groups and auto-expand non-empty groups
  React.useEffect(() => {
    const prevCounts = prevGroupedRef.current;
    const newCollapsed = new Set(collapsedGroups);
    let changed = false;

    PRIORITY_ORDER.forEach((key) => {
      const currentCount = grouped[key]?.length || 0;
      const prevCount = prevCounts[key] ?? currentCount;

      // If section became empty, auto-collapse it
      if (currentCount === 0 && prevCount > 0) {
        newCollapsed.add(key);
        changed = true;
      }
      // If section got tasks and wasn't manually collapsed, auto-expand it
      else if (
        currentCount > 0 &&
        prevCount === 0 &&
        !manuallyCollapsed.has(key)
      ) {
        newCollapsed.delete(key);
        changed = true;
      }
    });

    if (changed) {
      setCollapsedGroups(newCollapsed);
    }

    // Update prev counts for next comparison
    const newCounts: { [key: string]: number } = {};
    PRIORITY_ORDER.forEach((key) => {
      newCounts[key] = grouped[key]?.length || 0;
    });
    prevGroupedRef.current = newCounts;
  }, [grouped, collapsedGroups, manuallyCollapsed]);

  // Scheduling dialog state
  const [schedulingDialogOpen, setSchedulingDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] =
    useState<ExtendedWorkspaceTask | null>(null);

  // Quick task dialog state
  const [quickTaskDialogOpen, setQuickTaskDialogOpen] = useState(false);

  // Get task IDs that have scheduling configured (for fetching scheduled events)
  const tasksWithScheduling = useMemo(
    () =>
      allTasks.filter(
        (t) => (t.total_duration ?? 0) > 0 && t.calendar_hours && !t.closed_at
      ),
    [allTasks]
  );

  // Fetch scheduled events for tasks with scheduling configured
  // This fetches events in parallel and aggregates scheduled minutes per task
  const { data: scheduledMinutesMap = {} } = useQuery({
    queryKey: [
      'scheduled-events-batch',
      wsId,
      tasksWithScheduling.map((t) => t.id).join(','),
    ],
    queryFn: async () => {
      if (tasksWithScheduling.length === 0) return {};

      // Fetch events for all tasks in parallel
      const results = await Promise.allSettled(
        tasksWithScheduling.map(async (task) => {
          const response = await fetch(
            `/api/v1/workspaces/${wsId}/tasks/${task.id}/schedule`
          );
          if (!response.ok) return { taskId: task.id, minutes: 0 };
          const data = await response.json();
          const totalScheduled = (data.events || []).reduce(
            (sum: number, e: { scheduled_minutes?: number }) =>
              sum + (e.scheduled_minutes || 0),
            0
          );
          return { taskId: task.id, minutes: totalScheduled };
        })
      );

      // Create a map of taskId -> scheduledMinutes
      const map: Record<string, number> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          map[result.value.taskId] = result.value.minutes;
        }
      }
      return map;
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
    enabled: tasksWithScheduling.length > 0,
  });

  const toggleGroup = (priorityKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(priorityKey)) {
        // User is expanding - remove from manually collapsed
        next.delete(priorityKey);
        setManuallyCollapsed((prevManual) => {
          const newManual = new Set(prevManual);
          newManual.delete(priorityKey);
          return newManual;
        });
      } else {
        // User is collapsing - mark as manually collapsed
        next.add(priorityKey);
        setManuallyCollapsed((prevManual) => {
          const newManual = new Set(prevManual);
          newManual.add(priorityKey);
          return newManual;
        });
      }
      return next;
    });
  };

  // Register update callback to refresh data when task is updated
  onUpdate(() => {
    router.refresh();
  });

  // Debounced search function
  const debouncedSearch = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await getAssignedTasks(assigneeId, searchQuery.trim());
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching tasks:', error);
      setSearchError('Failed to search tasks');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, 500);

  const handlePriorityChange = async (taskId: string, newPriority: string) => {
    // TODO: Implement API call to update task priority
    console.log('Updating task priority:', taskId, newPriority);

    const response = await fetch(`/api/${wsId}/task/${taskId}/edit`, {
      method: 'PATCH',
      body: JSON.stringify({ priority: newPriority }),
    });

    if (!response.ok) {
      throw new Error('Failed to update task priority');
    }

    toast.success('Task priority updated');

    router.refresh();
  };

  const handleEdit = async (taskId: string) => {
    await openTaskById(taskId);
  };

  const handleTaskClick = (taskId: string) => {
    // Open scheduling dialog when clicking on a task
    const task = combinedTasks.find((t) => t.id === taskId);
    if (task) {
      setSelectedTask(task);
      setSchedulingDialogOpen(true);
    }
  };

  const handleScheduling = (taskId: string) => {
    // Open scheduling dialog to configure scheduling settings
    const task = combinedTasks.find((t) => t.id === taskId);
    if (task) {
      setSelectedTask(task);
      setSchedulingDialogOpen(true);
    }
  };

  // Date handlers with optimistic updates
  const handleStartDateChange = async (taskId: string, date: Date | null) => {
    const dateString = date?.toISOString() || null;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ start_date: dateString })
        .eq('id', taskId);

      if (error) throw error;
      toast.success(date ? 'Start date set' : 'Start date cleared');
      router.refresh();
    } catch (error) {
      console.error('Failed to update start date:', error);
      toast.error('Failed to update start date');
    }
  };

  const handleDueDateChange = async (taskId: string, date: Date | null) => {
    const dateString = date?.toISOString() || null;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ end_date: dateString })
        .eq('id', taskId);

      if (error) throw error;
      toast.success(date ? 'Due date set' : 'Due date cleared');
      router.refresh();
    } catch (error) {
      console.error('Failed to update due date:', error);
      toast.error('Failed to update due date');
    }
  };

  const handleMarkDone = async (taskId: string) => {
    const task = combinedTasks.find((t) => t.id === taskId);
    if (!task) {
      toast.error('Task not found');
      return;
    }

    try {
      const supabase = createClient();

      // If task has no list_id, just update closed_at directly
      if (!task.list_id) {
        const { error } = await supabase
          .from('tasks')
          .update({ closed_at: new Date().toISOString() })
          .eq('id', taskId);

        if (error) throw error;
        toast.success('Task marked as done');
        router.refresh();
        return;
      }

      // Get the board_id from the task's list
      const { data: taskList, error: listError } = await supabase
        .from('task_lists')
        .select('board_id')
        .eq('id', task.list_id)
        .single();

      if (listError) throw listError;

      // Fetch all lists for this board to find the done list
      const { data: boardLists, error: boardListsError } = await supabase
        .from('task_lists')
        .select('id, name, status, position')
        .eq('board_id', taskList.board_id)
        .eq('deleted', false)
        .order('position');

      if (boardListsError) throw boardListsError;

      // Find the first done or closed list (like task.tsx does)
      const doneList = boardLists?.find((list) => list.status === 'done');
      const closedList = boardLists?.find((list) => list.status === 'closed');
      const targetList = doneList || closedList;

      if (targetList && targetList.id !== task.list_id) {
        // Move to the done list (this also sets closed_at via the moveTask helper)
        const taskHelper = await import('@tuturuuu/utils/task-helper');
        await taskHelper.moveTask(supabase, taskId, targetList.id);
        toast.success('Task completed', {
          description: `Moved to ${targetList.name}`,
        });
      } else {
        // No done list or already in done list, just set closed_at
        const { error } = await supabase
          .from('tasks')
          .update({ closed_at: new Date().toISOString() })
          .eq('id', taskId);

        if (error) throw error;
        toast.success('Task marked as done');
      }

      router.refresh();
    } catch (error) {
      console.error('Failed to mark task as done:', error);
      toast.error('Failed to mark task as done');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      toast.success('Task moved to trash');
      router.refresh();
    } catch (error) {
      console.error('Failed to delete task:', error);
      toast.error('Failed to delete task');
    }
  };

  // Drag-and-drop handlers for calendar integration
  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    task: ExtendedWorkspaceTask
  ) => {
    const dragData = {
      type: 'task',
      taskId: task.id,
      taskName: task.name || 'Untitled Task',
      totalDuration: task.total_duration ?? 0,
      priority: task.priority,
      listId: task.list_id,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
  };

  // Handler for creating a new task - opens the quick task dialog
  const handleCreateTask = () => {
    setQuickTaskDialogOpen(true);
  };

  return (
    <div className="w-full space-y-3 overflow-hidden">
      {/* Header with Search and Add Task */}
      <div className="flex items-center gap-2">
        <div
          className={`relative flex-1 overflow-hidden rounded-lg border transition-all duration-200 ${
            isSearchFocused
              ? 'border-primary bg-background ring-1 ring-primary/20'
              : 'border-border bg-background/50 hover:bg-background/80'
          }`}
        >
          <div className="flex items-center">
            {isSearching ? (
              <Loader2 className="ml-2.5 h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Search
                className={`ml-2.5 h-3.5 w-3.5 transition-colors duration-200 ${
                  isSearchFocused ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
            )}
            <input
              className="w-full bg-transparent px-2.5 py-2 text-sm placeholder-muted-foreground outline-none"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </div>
          {searchError && (
            <div className="mt-1.5 rounded-md bg-dynamic-red/10 px-2 py-1.5 text-dynamic-red text-xs">
              {searchError}
            </div>
          )}
        </div>
        {/* Add Task Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCreateTask}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50 transition-colors hover:border-primary/50 hover:bg-background"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {allTasks.length > 0
              ? 'Create new task'
              : 'Go to Tasks page to create'}
          </TooltipContent>
        </Tooltip>
      </div>
      {/* Priority Groups */}
      <div className="w-full space-y-3 overflow-hidden">
        {PRIORITY_ORDER.map((priorityKey, index) => {
          const tasks = grouped[priorityKey] || [];
          const colorClasses = PRIORITY_GROUP_COLORS[priorityKey];
          const label = PRIORITY_LABELS[priorityKey];
          const isCollapsed = collapsedGroups.has(priorityKey);

          return (
            <div
              key={priorityKey}
              className="group slide-in-from-bottom-2 w-full animate-in overflow-hidden duration-200"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Collapsible Header */}
              <button
                type="button"
                onClick={() => toggleGroup(priorityKey)}
                className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                    isCollapsed && '-rotate-90'
                  )}
                />
                {getPriorityIcon(priorityKey, 'h-4 w-4 shrink-0')}
                <h3 className="font-medium text-foreground text-sm">{label}</h3>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                  {tasks.length}
                </span>
              </button>

              {/* Collapsible Content */}
              {!isCollapsed && tasks.length > 0 && (
                <div
                  className={`w-full overflow-hidden rounded-lg border bg-linear-to-br ${colorClasses} transition-all duration-200`}
                >
                  <div className="w-full space-y-1.5 overflow-hidden bg-background/80 p-2 backdrop-blur-sm">
                    {tasks.map((task) => {
                      // Calculate total and scheduled minutes for progress display
                      const totalMinutes = (task.total_duration ?? 0) * 60;
                      // Get scheduled minutes from the fetched data
                      const scheduledMinutes =
                        scheduledMinutesMap[task.id] ?? 0;
                      const progress =
                        totalMinutes > 0
                          ? Math.min(
                              100,
                              (scheduledMinutes / totalMinutes) * 100
                            )
                          : 0;
                      const isFullyScheduled =
                        scheduledMinutes >= totalMinutes && totalMinutes > 0;
                      const hasScheduleSettings =
                        (task.total_duration ?? 0) > 0 && task.calendar_hours;
                      const CalendarHoursIcon = task.calendar_hours
                        ? CALENDAR_HOURS_ICONS[task.calendar_hours]?.icon
                        : null;
                      // Use task completion status for visual styling
                      const isCompleted = !!task.closed_at;

                      return (
                        <div
                          key={task.id}
                          draggable={!isCompleted}
                          onDragStart={(e) => handleDragStart(e, task)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleTaskClick(task.id)}
                          className={cn(
                            'group/task relative w-full overflow-hidden rounded-md border bg-background/60 p-2 transition-all duration-150',
                            isCompleted
                              ? 'border-dynamic-green/30 bg-dynamic-green/5'
                              : 'cursor-grab border-border/50 hover:border-border hover:bg-background/80 active:cursor-grabbing'
                          )}
                        >
                          <div className="flex w-full items-start gap-2 overflow-hidden">
                            <div className="min-w-0 flex-1 overflow-hidden">
                              {/* Task Name */}
                              <div
                                className={cn(
                                  'line-clamp-2 cursor-pointer break-words font-medium text-sm transition-colors hover:text-primary',
                                  isCompleted && 'text-muted-foreground'
                                )}
                              >
                                {task.name || (
                                  <span className="text-muted-foreground italic">
                                    Untitled task
                                  </span>
                                )}
                              </div>

                              {/* Task Metadata Badges */}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {/* Due Date */}
                                {task.due_date && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex shrink-0 items-center gap-0.5 rounded bg-dynamic-red/10 px-1 py-0.5 text-[10px] text-dynamic-red">
                                        <Calendar className="h-2.5 w-2.5" />
                                        {formatDueDate(task.due_date)}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>Due date</TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Duration */}
                                {(task.total_duration ?? 0) > 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex shrink-0 items-center gap-0.5 rounded bg-dynamic-blue/10 px-1 py-0.5 text-[10px] text-dynamic-blue">
                                        <Clock className="h-2.5 w-2.5" />
                                        {formatDuration(totalMinutes)}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Allocated duration
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Calendar Hours Type */}
                                {CalendarHoursIcon && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex shrink-0 items-center rounded bg-dynamic-purple/10 px-1 py-0.5 text-[10px] text-dynamic-purple">
                                        <CalendarHoursIcon className="h-2.5 w-2.5" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {CALENDAR_HOURS_ICONS[
                                        task.calendar_hours!
                                      ]?.label ?? 'Schedule type'}
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Splittable Indicator */}
                                {task.is_splittable && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex shrink-0 items-center rounded bg-dynamic-orange/10 px-1 py-0.5 text-[10px] text-dynamic-orange">
                                        <Scissors className="h-2.5 w-2.5" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Splittable (
                                      {formatDuration(
                                        task.min_split_duration_minutes ?? 30
                                      )}{' '}
                                      -{' '}
                                      {formatDuration(
                                        task.max_split_duration_minutes ?? 120
                                      )}
                                      )
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Completed Indicator */}
                                {isCompleted && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="inline-flex shrink-0 items-center gap-0.5 rounded bg-dynamic-green/10 px-1 py-0.5 text-[10px] text-dynamic-green">
                                        <CheckCircle className="h-2.5 w-2.5" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Task completed
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>

                              {/* Progress/Duration Display */}
                              {hasScheduleSettings && (
                                <div className="mt-1.5 w-full space-y-0.5">
                                  <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                                    <span>
                                      {formatDuration(scheduledMinutes)} /{' '}
                                      {formatDuration(totalMinutes)}
                                    </span>
                                    {isFullyScheduled && (
                                      <span className="text-dynamic-green">
                                        ✓ Scheduled
                                      </span>
                                    )}
                                  </div>
                                  <Progress
                                    value={progress}
                                    className={cn(
                                      'h-1',
                                      isFullyScheduled
                                        ? '[&>div]:bg-dynamic-green'
                                        : '[&>div]:bg-dynamic-blue'
                                    )}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Actions - Stop propagation to prevent task click */}
                            <div
                              className="flex shrink-0 items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Three-dots menu - hidden by default, appears on hover (opacity only, no width change) */}
                              <div className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/task:opacity-100">
                                <ActionsDropdown
                                  taskId={task.id}
                                  taskName={task.name || 'Untitled'}
                                  startDate={task.start_date}
                                  endDate={task.end_date}
                                  onEdit={handleEdit}
                                  onScheduling={handleScheduling}
                                  onStartDateChange={handleStartDateChange}
                                  onDueDateChange={handleDueDateChange}
                                  onMarkDone={handleMarkDone}
                                  onDelete={handleDelete}
                                />
                              </div>
                              <PriorityDropdown
                                taskId={task.id}
                                currentPriority={task.priority || 'normal'}
                                onPriorityChange={handlePriorityChange}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state when expanded but no tasks */}
              {!isCollapsed && tasks.length === 0 && (
                <div className="rounded-md border border-border/50 border-dashed p-2 text-center">
                  <div className="text-muted-foreground text-xs">No tasks</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <SchedulingDialog
        wsId={wsId}
        task={selectedTask}
        open={schedulingDialogOpen}
        onOpenChange={setSchedulingDialogOpen}
      />
      <QuickTaskDialog
        wsId={wsId}
        open={quickTaskDialogOpen}
        onOpenChange={setQuickTaskDialogOpen}
        onSuccess={() => router.refresh()}
        userId={assigneeId}
        isPersonalWorkspace={isPersonalWorkspace}
      />
    </div>
  );
}

function formatDueDate(date: string | Date) {
  // expects date as string or Date, returns MM/DD or DD/MM as you prefer
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
