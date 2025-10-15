import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import {
  moveTask,
  useDeleteTask,
  useUpdateTask,
} from '@tuturuuu/utils/task-helper';
import { addDays } from 'date-fns';
import { useCallback } from 'react';

interface UseTaskActionsProps {
  task: Task;
  boardId: string;
  targetCompletionList?: TaskList | null;
  targetClosedList?: TaskList | null;
  availableLists: TaskList[];
  onUpdate: () => void;
  setIsLoading: (loading: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setCustomDateDialogOpen?: (open: boolean) => void;
  setDeleteDialogOpen?: (open: boolean) => void;
  setEstimationSaving?: (saving: boolean) => void;
}

export function useTaskActions({
  task,
  boardId,
  targetCompletionList,
  targetClosedList,
  availableLists,
  onUpdate,
  setIsLoading,
  setMenuOpen,
  setCustomDateDialogOpen,
  setDeleteDialogOpen,
  setEstimationSaving,
}: UseTaskActionsProps) {
  const queryClient = useQueryClient();
  const updateTaskMutation = useUpdateTask(boardId);
  const deleteTaskMutation = useDeleteTask(boardId);

  const handleArchiveToggle = useCallback(async () => {
    if (!onUpdate) return;
    setIsLoading(true);

    const newClosedState = !task.closed_at;

    if (
      newClosedState &&
      targetCompletionList &&
      targetCompletionList.id !== task.list_id
    ) {
      const supabase = createClient();
      try {
        // moveTask handles setting archived status based on target list
        await moveTask(supabase, task.id, targetCompletionList.id);

        toast.success('Task completed', {
          description: `Task marked as done and moved to ${targetCompletionList.name}`,
        });

        onUpdate();
      } catch (error) {
        console.error('Failed to complete task:', error);
        toast.error('Error', {
          description: 'Failed to complete task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      updateTaskMutation.mutate(
        {
          taskId: task.id,
          updates: {
            closed_at: newClosedState ? new Date().toISOString() : undefined,
          },
        },
        {
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    }
  }, [task, targetCompletionList, onUpdate, setIsLoading, updateTaskMutation]);

  const handleMoveToCompletion = useCallback(async () => {
    if (!targetCompletionList || !onUpdate) return;

    setIsLoading(true);

    const supabase = createClient();
    try {
      await moveTask(supabase, task.id, targetCompletionList.id);
      onUpdate();
    } catch (error) {
      console.error('Failed to move task to completion:', error);
      toast.error('Error', {
        description: 'Failed to complete task. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [targetCompletionList, onUpdate, task.id, setIsLoading, setMenuOpen]);

  const handleMoveToClose = useCallback(async () => {
    if (!targetClosedList || !onUpdate) return;

    setIsLoading(true);

    const supabase = createClient();
    try {
      await moveTask(supabase, task.id, targetClosedList.id);
      toast.success('Success', {
        description: 'Task marked as closed',
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to move task to closed:', error);
      toast.error('Error', {
        description: 'Failed to close task. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [targetClosedList, onUpdate, task.id, setIsLoading, setMenuOpen]);

  const handleDelete = useCallback(() => {
    setIsLoading(true);
    deleteTaskMutation.mutate(task.id, {
      onSuccess: () => {
        setDeleteDialogOpen?.(false);
      },
      onSettled: () => {
        setIsLoading(false);
      },
    });
  }, [task.id, deleteTaskMutation, setIsLoading, setDeleteDialogOpen]);

  const handleRemoveAllAssignees = useCallback(async () => {
    if (!task.assignees || task.assignees.length === 0) return;

    setIsLoading(true);
    const supabase = createClient();

    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

    queryClient.setQueryData<Task[] | undefined>(
      ['tasks', boardId],
      (old: Task[] | undefined) => {
        if (!old) return old;
        return old.map((t) => {
          if (t.id === task.id) {
            return { ...t, assignees: [] };
          }
          return t;
        });
      }
    );

    try {
      const { error } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', task.id);

      if (error) throw error;

      toast.success('Success', {
        description: 'All assignees removed from task',
      });
    } catch (error) {
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      console.error('Failed to remove all assignees:', error);
      toast.error('Error', {
        description: 'Failed to remove assignees. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [task, boardId, queryClient, setIsLoading, setMenuOpen]);

  const handleRemoveAssignee = useCallback(
    async (assigneeId: string) => {
      setIsLoading(true);
      const supabase = createClient();

      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      queryClient.setQueryData<Task[] | undefined>(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (t.id === task.id) {
              return {
                ...t,
                assignees:
                  t.assignees?.filter((a) => a.id !== assigneeId) || [],
              };
            }
            return t;
          });
        }
      );

      try {
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', task.id)
          .eq('user_id', assigneeId);

        if (error) throw error;

        const assignee = task.assignees?.find((a) => a.id === assigneeId);
        toast.success('Success', {
          description: `${assignee?.display_name || assignee?.email || 'Assignee'} removed from task`,
        });
      } catch (error) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
        console.error('Failed to remove assignee:', error);
        toast.error('Error', {
          description: 'Failed to remove assignee. Please try again.',
        });
      } finally {
        setIsLoading(false);
        setMenuOpen(false);
      }
    },
    [task, boardId, queryClient, setIsLoading, setMenuOpen]
  );

  const handleMoveToList = useCallback(
    async (targetListId: string) => {
      if (targetListId === task.list_id) {
        setMenuOpen(false);
        return;
      }

      setIsLoading(true);

      const supabase = createClient();
      try {
        await moveTask(supabase, task.id, targetListId);

        const targetList = availableLists.find(
          (list) => list.id === targetListId
        );
        toast.success('Success', {
          description: `Task moved to ${targetList?.name || 'selected list'}`,
        });
        onUpdate();
      } catch (error) {
        console.error('Failed to move task:', error);
        toast.error('Error', {
          description: 'Failed to move task. Please try again.',
        });
      } finally {
        setIsLoading(false);
        setMenuOpen(false);
      }
    },
    [task.id, task.list_id, availableLists, onUpdate, setIsLoading, setMenuOpen]
  );

  const handleDueDateChange = useCallback(
    async (days: number | null) => {
      let newDate: string | null = null;
      if (days !== null) {
        const target = addDays(new Date(), days);
        target.setHours(23, 59, 59, 999);
        newDate = target.toISOString();
      }
      setIsLoading(true);
      updateTaskMutation.mutate(
        { taskId: task.id, updates: { end_date: newDate } },
        {
          onSuccess: () => {
            toast.success('Due date updated', {
              description: newDate
                ? 'Due date set successfully'
                : 'Due date removed',
            });
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    },
    [task.id, updateTaskMutation, setIsLoading]
  );

  const handlePriorityChange = useCallback(
    (newPriority: TaskPriority | null) => {
      if (newPriority === task.priority) return;
      setIsLoading(true);
      updateTaskMutation.mutate(
        { taskId: task.id, updates: { priority: newPriority } },
        {
          onSuccess: () => {
            toast.success('Priority updated', {
              description: newPriority
                ? 'Priority changed'
                : 'Priority cleared',
            });
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    },
    [task.id, task.priority, updateTaskMutation, setIsLoading]
  );

  const updateEstimationPoints = useCallback(
    async (points: number | null) => {
      if (points === task.estimation_points) return;
      setEstimationSaving?.(true);
      try {
        await updateTaskMutation.mutateAsync({
          taskId: task.id,
          updates: { estimation_points: points },
        });
      } catch (e: any) {
        console.error('Failed to update estimation', e);
        toast.error('Failed to update estimation', {
          description: e.message || 'Please try again',
        });
      } finally {
        setEstimationSaving?.(false);
      }
    },
    [task.id, task.estimation_points, updateTaskMutation, setEstimationSaving]
  );

  const handleCustomDateChange = useCallback(
    async (date: Date | undefined) => {
      let newDate: string | null = null;

      if (date) {
        const selectedDate = new Date(date);

        if (
          selectedDate.getHours() === 0 &&
          selectedDate.getMinutes() === 0 &&
          selectedDate.getSeconds() === 0 &&
          selectedDate.getMilliseconds() === 0
        ) {
          selectedDate.setHours(23, 59, 59, 999);
        }

        newDate = selectedDate.toISOString();
      }

      setIsLoading(true);
      setCustomDateDialogOpen?.(false); // Close dialog immediately when date is selected

      updateTaskMutation.mutate(
        { taskId: task.id, updates: { end_date: newDate } },
        {
          onSuccess: () => {
            toast.success('Due date updated', {
              description: newDate
                ? 'Custom due date set successfully'
                : 'Due date removed',
            });
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    },
    [task.id, updateTaskMutation, setIsLoading, setCustomDateDialogOpen]
  );

  return {
    handleArchiveToggle,
    handleMoveToCompletion,
    handleMoveToClose,
    handleDelete,
    handleRemoveAllAssignees,
    handleRemoveAssignee,
    handleMoveToList,
    handleDueDateChange,
    handlePriorityChange,
    updateEstimationPoints,
    handleCustomDateChange,
  };
}
