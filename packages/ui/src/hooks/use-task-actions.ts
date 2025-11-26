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
  selectedTasks?: Set<string>; // For bulk operations
  isMultiSelectMode?: boolean;
  onClearSelection?: () => void; // Callback to clear selection after bulk operations
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
  selectedTasks,
  isMultiSelectMode,
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

      // Check if we're in multi-select mode and have multiple tasks selected
      const shouldBulkMove =
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(task.id);
      const tasksToMove = shouldBulkMove
        ? Array.from(selectedTasks)
        : [task.id];

      try {
        // Move all tasks in parallel
        await Promise.all(
          tasksToMove.map((taskId) => moveTask(supabase, taskId, targetListId))
        );

        const targetList = availableLists.find(
          (list) => list.id === targetListId
        );

        const taskCount = tasksToMove.length;
        toast.success('Success', {
          description:
            taskCount > 1
              ? `${taskCount} tasks moved to ${targetList?.name || 'selected list'}`
              : `Task moved to ${targetList?.name || 'selected list'}`,
        });

        // Don't auto-clear selection - let user manually clear with "Clear" button

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
    [
      task.id,
      task.list_id,
      availableLists,
      onUpdate,
      setIsLoading,
      setMenuOpen,
      isMultiSelectMode,
      selectedTasks,
    ]
  );

  const handleDueDateChange = useCallback(
    async (days: number | null) => {
      let newDate: string | null = null;
      if (days !== null) {
        const target = addDays(new Date(), days);
        target.setHours(23, 59, 59, 999);
        newDate = target.toISOString();
      }

      // Check if we're in multi-select mode and have multiple tasks selected
      const shouldBulkUpdate =
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(task.id);
      const tasksToUpdate = shouldBulkUpdate
        ? Array.from(selectedTasks)
        : [task.id];

      setIsLoading(true);

      // Store previous state for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      try {
        // Optimistic update
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) =>
              tasksToUpdate.includes(t.id) ? { ...t, end_date: newDate } : t
            );
          }
        );

        // Use direct Supabase update for bulk operations
        if (shouldBulkUpdate) {
          const supabase = createClient();
          const { error, count } = await supabase
            .from('tasks')
            .update({ end_date: newDate }, { count: 'exact' })
            .in('id', tasksToUpdate)
            .select('id, name, end_date, list_id'); // Explicitly select only needed columns to avoid embedding

          if (error) throw error;
          console.log(`✅ Bulk updated ${count} tasks with due date`);
        } else {
          // Use mutation for single task
          await updateTaskMutation.mutateAsync({
            taskId: task.id,
            updates: { end_date: newDate },
          });
        }

        const taskCount = tasksToUpdate.length;
        toast.success('Due date updated', {
          description:
            taskCount > 1
              ? `${taskCount} tasks updated`
              : newDate
                ? 'Due date set successfully'
                : 'Due date removed',
        });

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync
      } catch (error) {
        console.error('Failed to update due date:', error);
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        toast.error('Error', {
          description: 'Failed to update due date. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      task.id,
      updateTaskMutation,
      setIsLoading,
      isMultiSelectMode,
      selectedTasks,
      queryClient,
      boardId,
    ]
  );

  const handlePriorityChange = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (newPriority === task.priority && !isMultiSelectMode) return;

      // Check if we're in multi-select mode and have multiple tasks selected
      const shouldBulkUpdate =
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(task.id);
      const tasksToUpdate = shouldBulkUpdate
        ? Array.from(selectedTasks)
        : [task.id];

      console.log('🎯 handlePriorityChange called:', {
        taskId: task.id,
        newPriority,
        isMultiSelectMode,
        selectedTasksSize: selectedTasks?.size,
        selectedTasksArray: Array.from(selectedTasks || []),
        shouldBulkUpdate,
        tasksToUpdate,
        tasksToUpdateCount: tasksToUpdate.length,
      });

      setIsLoading(true);

      // Store previous state for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      try {
        // Optimistic update
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) =>
              tasksToUpdate.includes(t.id) ? { ...t, priority: newPriority } : t
            );
          }
        );

        // Use direct Supabase update for bulk operations
        if (shouldBulkUpdate) {
          const supabase = createClient();
          console.log('🔄 Executing bulk Supabase update:', {
            tasksToUpdate,
            count: tasksToUpdate.length,
            priority: newPriority,
          });

          const result = await supabase
            .from('tasks')
            .update({ priority: newPriority }, { count: 'exact' })
            .in('id', tasksToUpdate)
            .select('id, name, priority, list_id'); // Explicitly select only needed columns to avoid embedding

          console.log('✅ Supabase update result:', {
            error: result.error,
            status: result.status,
            statusText: result.statusText,
            count: result.count,
          });

          if (result.error) throw result.error;
        } else {
          // Use mutation for single task
          await updateTaskMutation.mutateAsync({
            taskId: task.id,
            updates: { priority: newPriority },
          });
        }

        const taskCount = tasksToUpdate.length;
        toast.success('Priority updated', {
          description:
            taskCount > 1
              ? `${taskCount} tasks updated`
              : newPriority
                ? 'Priority changed'
                : 'Priority cleared',
        });

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync

        console.log('✅ Priority update completed successfully');

        // Don't auto-clear selection - let user manually clear with "Clear" button
      } catch (error) {
        console.error('❌ Failed to update priority:', error);
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        toast.error('Error', {
          description: 'Failed to update priority. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      task.id,
      task.priority,
      updateTaskMutation,
      setIsLoading,
      isMultiSelectMode,
      selectedTasks,
      queryClient,
      boardId,
    ]
  );

  const updateEstimationPoints = useCallback(
    async (points: number | null) => {
      if (points === task.estimation_points && !isMultiSelectMode) return;

      // Check if we're in multi-select mode and have multiple tasks selected
      const shouldBulkUpdate =
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(task.id);
      const tasksToUpdate = shouldBulkUpdate
        ? Array.from(selectedTasks)
        : [task.id];

      setEstimationSaving?.(true);

      // Store previous state for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      try {
        // Optimistic update
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) =>
              tasksToUpdate.includes(t.id)
                ? { ...t, estimation_points: points }
                : t
            );
          }
        );

        // Use direct Supabase update for bulk operations
        if (shouldBulkUpdate) {
          const supabase = createClient();
          const { error, count } = await supabase
            .from('tasks')
            .update({ estimation_points: points }, { count: 'exact' })
            .in('id', tasksToUpdate)
            .select('id, name, estimation_points, list_id'); // Explicitly select only needed columns to avoid embedding

          if (error) throw error;
          console.log(`✅ Bulk updated ${count} tasks with estimation points`);
        } else {
          // Use mutation for single task
          await updateTaskMutation.mutateAsync({
            taskId: task.id,
            updates: { estimation_points: points },
          });
        }

        const taskCount = tasksToUpdate.length;
        toast.success('Estimation updated', {
          description:
            taskCount > 1
              ? `${taskCount} tasks updated`
              : 'Estimation points updated successfully',
        });

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync
      } catch (e: any) {
        console.error('Failed to update estimation', e);
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        toast.error('Failed to update estimation', {
          description: e.message || 'Please try again',
        });
      } finally {
        setEstimationSaving?.(false);
      }
    },
    [
      task.id,
      task.estimation_points,
      updateTaskMutation,
      setEstimationSaving,
      isMultiSelectMode,
      selectedTasks,
      queryClient,
      boardId,
    ]
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

  const handleToggleAssignee = useCallback(
    async (assigneeId: string) => {
      // Check if we're in multi-select mode with multiple tasks selected
      const shouldBulkUpdate =
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(task.id);

      const tasksToUpdate = shouldBulkUpdate
        ? Array.from(selectedTasks)
        : [task.id];

      setIsLoading(true);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value BEFORE optimistic update
      const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
        | Task[]
        | undefined;

      // Determine action: remove if ALL selected tasks have the assignee, add otherwise
      let active = task.assignees?.some((a) => a.id === assigneeId);

      if (shouldBulkUpdate && previousTasks) {
        const selectedTasksData = previousTasks.filter((t) =>
          selectedTasks?.has(t.id)
        );
        // Only mark as active (to remove) if ALL selected tasks have the assignee
        active = selectedTasksData.every((t) =>
          t.assignees?.some((a) => a.id === assigneeId)
        );
      }

      // Pre-calculate which tasks actually need to change
      const tasksNeedingAssignee = !active
        ? tasksToUpdate.filter((taskId) => {
            const t = previousTasks?.find((ct) => ct.id === taskId);
            return !t?.assignees?.some((a) => a.id === assigneeId);
          })
        : [];

      const tasksToRemoveFrom = active
        ? tasksToUpdate.filter((taskId) => {
            const t = previousTasks?.find((ct) => ct.id === taskId);
            return t?.assignees?.some((a) => a.id === assigneeId);
          })
        : [];

      // Get assignee details from previous tasks for optimistic update
      let assigneeDetails = null;
      if (!active && previousTasks) {
        for (const t of previousTasks) {
          const found = t.assignees?.find((a) => a.id === assigneeId);
          if (found) {
            assigneeDetails = found;
            break;
          }
        }
      }

      // Optimistically update the cache - only update tasks that actually change
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            if (active && tasksToRemoveFrom.includes(t.id)) {
              // Remove the assignee
              return {
                ...t,
                assignees:
                  t.assignees?.filter((a) => a.id !== assigneeId) || [],
              };
            } else if (!active && tasksNeedingAssignee.includes(t.id)) {
              // Add the assignee
              return {
                ...t,
                assignees: [
                  ...(t.assignees || []),
                  assigneeDetails || {
                    id: assigneeId,
                    display_name: 'User',
                    email: '',
                  },
                ],
              };
            }
            return t;
          });
        }
      );

      try {
        const supabase = createClient();
        if (active) {
          // Remove assignee only from tasks that have them
          if (tasksToRemoveFrom.length > 0) {
            const { error } = await supabase
              .from('task_assignees')
              .delete()
              .in('task_id', tasksToRemoveFrom)
              .eq('user_id', assigneeId);
            if (error) throw error;
          }
        } else {
          // Add assignee to selected tasks that don't already have them
          if (tasksNeedingAssignee.length > 0) {
            const rows = tasksNeedingAssignee.map((taskId) => ({
              task_id: taskId,
              user_id: assigneeId,
            }));
            const { error } = await supabase
              .from('task_assignees')
              .insert(rows);

            // Ignore duplicate key errors (code '23505' for unique_violation)
            if (error && error.code !== '23505') {
              throw error;
            }
          }
        }

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync

        const taskCount = active
          ? tasksToRemoveFrom.length
          : tasksNeedingAssignee.length;
        toast.success(active ? 'Assignee removed' : 'Assignee added', {
          description: taskCount > 1 ? `${taskCount} tasks updated` : undefined,
        });

        // Don't auto-clear selection - let user manually clear with "Clear" button
      } catch (e: any) {
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        console.error('Failed to toggle assignee:', e);
        toast.error('Error', {
          description: 'Failed to update assignee. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [task, boardId, queryClient, setIsLoading, isMultiSelectMode, selectedTasks]
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
    handleToggleAssignee,
  };
}
