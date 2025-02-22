'use client';

import { getTasks } from '@/lib/task-helper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils';
import { format } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  Users,
} from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  boardId: string;
}

export function BoardSummary({ boardId }: Props) {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      return getTasks(supabase, boardId);
    },
  });

  useEffect(() => {
    const supabase = createClient();

    // Set up real-time subscription
    const tasksSubscription = supabase
      .channel('tasks-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `board_id=eq.${boardId}`,
        },
        () => {
          // Invalidate the tasks query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `task_id=in.(${tasks.map((t) => t.id).join(',')})`,
        },
        () => {
          // Invalidate the tasks query to trigger a refetch
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      )
      .subscribe();

    return () => {
      tasksSubscription.unsubscribe();
    };
  }, [boardId, queryClient, tasks]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.archived).length;
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
    p1: tasks.filter((task) => !task.archived && task.priority === 1).length,
    p2: tasks.filter((task) => !task.archived && task.priority === 2).length,
    p3: tasks.filter((task) => !task.archived && task.priority === 3).length,
  };

  const nextDueTask = tasks
    .filter(
      (task) =>
        !task.archived && task.end_date && new Date(task.end_date) > new Date()
    )
    .sort(
      (a, b) =>
        new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()
    )[0];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Progress</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Progress value={completionRate} className="h-2" />
          </div>
          <span className="text-sm text-muted-foreground">
            {Math.round(completionRate)}%
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {completedTasks} of {totalTasks} tasks completed
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Task Status</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {overdueTasks} overdue tasks
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {upcomingTasks} upcoming tasks
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {unassignedTasks} unassigned tasks
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Priority Distribution</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-sm">
            <Flag className="h-4 w-4 fill-destructive stroke-destructive" />
            {priorityTasks.p1} P1 tasks
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Flag className="h-4 w-4 fill-yellow-500 stroke-yellow-500" />
            {priorityTasks.p2} P2 tasks
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Flag className="h-4 w-4 fill-green-500 stroke-green-500" />
            {priorityTasks.p3} P3 tasks
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Next Due</h3>
        {nextDueTask ? (
          <div className="space-y-1">
            <p
              className={cn('line-clamp-1 text-sm', {
                'text-muted-foreground line-through': nextDueTask.archived,
              })}
            >
              {nextDueTask.name}
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {format(new Date(nextDueTask.end_date!), 'PPP')}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming tasks</p>
        )}
      </div>
    </div>
  );
}
