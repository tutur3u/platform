'use client';

import { getTaskLists, getTasks } from '@/lib/task-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';

interface Props {
  board: TaskBoard;
}

export function BoardSummary({ board }: Props) {
  const { id: boardId } = board;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
  });

  const { data: lists = [] } = useQuery({
    queryKey: ['task-lists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTaskLists(supabase, boardId);
    },
  });

  // Removed real-time subscriptions to prevent cache invalidation conflicts with drag-and-drop

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => {
    const taskList = lists.find((list) => list.id === task.list_id);
    return (
      task.archived ||
      taskList?.status === 'done' ||
      taskList?.status === 'closed'
    );
  }).length;
  const completionRate = totalTasks ? (completedTasks / totalTasks) * 100 : 0;

  const overdueTasks = tasks.filter(
    (task) =>
      !task.archived && task.end_date && new Date(task.end_date) < new Date()
  ).length;

  const upcomingTasks = tasks.filter(
    (task) =>
      !task.archived && task.end_date && new Date(task.end_date) > new Date()
  ).length;

  const unassignedTasks = tasks.filter(
    (task) => !task.archived && (!task.assignees || task.assignees.length === 0)
  ).length;

  const priorityTasks = {
    p1: tasks.filter((task) => !task.archived && task.priority === 'critical')
      .length,
    p2: tasks.filter((task) => !task.archived && task.priority === 'high')
      .length,
    p3: tasks.filter((task) => !task.archived && task.priority === 'normal')
      .length,
  };

  const nextDueTask = tasks
    .filter(
      (task) =>
        !task.archived && task.end_date && new Date(task.end_date) > new Date()
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
    <div className="mb-2 border-b pb-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Progress Card */}
        <div className="space-y-3 rounded-xl border border-blue-200/30 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-blue-800/30 dark:from-blue-950/20 dark:to-indigo-950/20">
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {Math.round(completionRate)}%
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
        </div>

        {/* Task Status Card */}
        <div className="space-y-3 rounded-xl border border-amber-200/30 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-amber-800/30 dark:from-amber-950/20 dark:to-orange-950/20">
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
        <div className="space-y-3 rounded-xl border border-purple-200/30 bg-gradient-to-br from-purple-50 to-pink-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-purple-800/30 dark:from-purple-950/20 dark:to-pink-950/20">
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
        <div className="space-y-3 rounded-xl border border-green-200/30 bg-gradient-to-br from-green-50 to-emerald-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-green-800/30 dark:from-green-950/20 dark:to-emerald-950/20">
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
                className={cn('line-clamp-2 text-sm font-medium', {
                  'text-muted-foreground line-through': nextDueTask.archived,
                })}
              >
                {nextDueTask.name}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                {nextDueTask.end_date
                  ? format(new Date(nextDueTask.end_date), 'MMM d, yyyy')
                  : 'No date'}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No upcoming deadlines
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
