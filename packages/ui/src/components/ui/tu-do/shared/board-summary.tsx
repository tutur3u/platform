'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { getTaskLists, getTasks } from '@tuturuuu/utils/task-helper';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format } from 'date-fns';
import { type JSX, useMemo } from 'react';

interface Props {
  board: WorkspaceTaskBoard;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function BoardSummary({
  board,
  collapsed = false,
  onToggleCollapsed,
}: Props): JSX.Element {
  const { id: boardId } = board;
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
  });

  const { data: lists = [] } = useQuery<TaskList[]>({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskLists(supabase, boardId);
    },
  });

  // Create memoized map of list status by id for O(1) lookups
  const listStatusMap = useMemo(() => {
    const map = new Map<string, TaskList['status']>();
    for (const list of lists) {
      map.set(list.id, list.status);
    }
    return map;
  }, [lists]);

  const totalTasks = tasks.length;

  // Helper function to check if a task is completed
  const isTaskCompleted = (task: Task): boolean => {
    const listStatus = listStatusMap.get(task.list_id);
    return !!(
      task.closed_at ||
      task.completed_at ||
      listStatus === 'done' ||
      listStatus === 'closed'
    );
  };

  const completedTasks = tasks.filter(isTaskCompleted).length;
  const completionRate = totalTasks ? (completedTasks / totalTasks) * 100 : 0;

  const overdueTasks = tasks.filter(
    (task) =>
      !isTaskCompleted(task) &&
      task.end_date &&
      new Date(task.end_date) < new Date()
  ).length;

  const upcomingTasks = tasks.filter(
    (task) =>
      !isTaskCompleted(task) &&
      task.end_date &&
      new Date(task.end_date) > new Date()
  ).length;

  const unassignedTasks = tasks.filter(
    (task) =>
      !isTaskCompleted(task) && (!task.assignees || task.assignees.length === 0)
  ).length;

  const priorityTasks = {
    p1: tasks.filter(
      (task) => !isTaskCompleted(task) && task.priority === 'critical'
    ).length,
    p2: tasks.filter(
      (task) => !isTaskCompleted(task) && task.priority === 'high'
    ).length,
    p3: tasks.filter(
      (task) => !isTaskCompleted(task) && task.priority === 'normal'
    ).length,
  };

  const nextDueTask = tasks
    .filter(
      (task) =>
        !isTaskCompleted(task) &&
        task.end_date &&
        new Date(task.end_date) > new Date()
    )
    .sort((a, b) => {
      // Since we filtered for tasks with end_date, we can safely assume they exist
      const aDate = a.end_date ? new Date(a.end_date).getTime() : 0;
      const bDate = b.end_date ? new Date(b.end_date).getTime() : 0;
      return aDate - bDate;
    })[0];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mb-2 border-b pb-2">
      {/* Collapsible Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Board Overview</h2>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm hover:bg-muted"
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-4 w-4" />
              Show Overview
            </>
          ) : (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide Overview
            </>
          )}
        </button>
      </div>

      {/* Collapsible Content */}
      {!collapsed && (
        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Progress Card */}
          <div className="space-y-3 rounded-xl border border-blue-200/30 bg-linear-to-br from-blue-50 to-indigo-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-blue-800/30 dark:from-blue-950/20 dark:to-indigo-950/20">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Progress
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Progress value={completionRate} className="h-3" />
                </div>
                <span className="font-medium text-gray-700 text-sm dark:text-gray-300">
                  {Math.round(completionRate)}%
                </span>
              </div>
              <p className="text-gray-600 text-sm dark:text-gray-400">
                {completedTasks} of {totalTasks} tasks completed
              </p>
            </div>
          </div>

          {/* Task Status Card */}
          <div className="space-y-3 rounded-xl border border-amber-200/30 bg-linear-to-br from-amber-50 to-orange-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-amber-800/30 dark:from-amber-950/20 dark:to-orange-950/20">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Task Status
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-red-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Overdue
                  </span>
                </div>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {overdueTasks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Upcoming
                  </span>
                </div>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {upcomingTasks}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                  <span className="text-gray-600 dark:text-gray-400">
                    Unassigned
                  </span>
                </div>
                <span className="font-medium text-gray-600 dark:text-gray-400">
                  {unassignedTasks}
                </span>
              </div>
            </div>
          </div>

          {/* Priority Distribution Card */}
          <div className="space-y-3 rounded-xl border border-purple-200/30 bg-linear-to-br from-purple-50 to-pink-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-purple-800/30 dark:from-purple-950/20 dark:to-pink-950/20">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Flag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Priority
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Flag className="h-3 w-3 fill-red-500 stroke-red-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    High (P1)
                  </span>
                </div>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {priorityTasks.p1}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Flag className="h-3 w-3 fill-yellow-500 stroke-yellow-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Medium (P2)
                  </span>
                </div>
                <span className="font-medium text-yellow-600 dark:text-yellow-400">
                  {priorityTasks.p2}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Flag className="h-3 w-3 fill-green-500 stroke-green-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Low (P3)
                  </span>
                </div>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {priorityTasks.p3}
                </span>
              </div>
            </div>
          </div>

          {/* Next Due Card */}
          <div className="space-y-3 rounded-xl border border-green-200/30 bg-linear-to-br from-green-50 to-emerald-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-green-800/30 dark:from-green-950/20 dark:to-emerald-950/20">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Next Due
              </h3>
            </div>
            {nextDueTask ? (
              <div className="space-y-2">
                <p
                  className={cn('line-clamp-2 font-medium text-sm', {
                    'text-muted-foreground line-through':
                      nextDueTask.completed_at || nextDueTask.closed_at,
                  })}
                >
                  {nextDueTask.name}
                </p>
                <div className="flex items-center gap-1 text-gray-600 text-xs dark:text-gray-400">
                  <Calendar className="h-3 w-3" />
                  {nextDueTask.end_date
                    ? format(
                        new Date(nextDueTask.end_date),
                        `MMM d, yyyy 'at' ${timePattern}`
                      )
                    : 'No date'}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm dark:text-gray-400">
                No upcoming deadlines
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
