import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { moveTask, useUpdateTask } from '@tuturuuu/utils/task-helper';
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

  const handleArchiveToggle = useCallback(async () => {
    if (!onUpdate) return;
    setIsLoading(true);

    const newClosedState = !task.closed_at;

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

    if (
      newClosedState &&
      targetCompletionList &&
      targetCompletionList.id !== task.list_id
    ) {
      const supabase = createClient();
      try {
        // Optimistic update: move task to completion list and set closed_at
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    list_id: targetCompletionList.id,
                    closed_at: new Date().toISOString(),
                  }
                : t
            );
          }
        );

        // moveTask handles setting archived status based on target list
        await moveTask(supabase, task.id, targetCompletionList.id);

        toast.success('Task completed', {
          description: `Task marked as done and moved to ${targetCompletionList.name}`,
        });

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync
      } catch (error) {
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
        console.error('Failed to complete task:', error);
        toast.error('Error', {
          description: 'Failed to complete task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Optimistic update for simple toggle
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  closed_at: newClosedState ? new Date().toISOString() : null,
                }
              : t
          );
        }
      );

      updateTaskMutation.mutate(
        {
          taskId: task.id,
          updates: {
            closed_at: newClosedState ? new Date().toISOString() : undefined,
          },
        },
        {
          onError: () => {
            // Rollback on error
            if (previousTasks) {
              queryClient.setQueryData(['tasks', boardId], previousTasks);
            }
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    }
  }, [
    task.id,
    task.closed_at,
    task.list_id,
    targetCompletionList,
    onUpdate,
    setIsLoading,
    updateTaskMutation,
    queryClient,
    boardId,
  ]);

  const handleMoveToCompletion = useCallback(async () => {
    if (!targetCompletionList || !onUpdate) return;

    setIsLoading(true);

    // Check if we're in multi-select mode and have multiple tasks selected
    const shouldBulkMove =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);
    const tasksToMove = shouldBulkMove ? Array.from(selectedTasks) : [task.id];

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

    const supabase = createClient();
    try {
      // Optimistic update: move tasks to completion list and set closed_at/completed_at
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          const now = new Date().toISOString();
          return old.map((t) =>
            tasksToMove.includes(t.id)
              ? {
                  ...t,
                  list_id: targetCompletionList.id,
                  closed_at: now,
                  completed_at:
                    targetCompletionList.status === 'done'
                      ? now
                      : t.completed_at,
                }
              : t
          );
        }
      );

      // Move tasks one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of tasksToMove) {
        try {
          await moveTask(supabase, taskId, targetCompletionList.id);
          successCount++;
        } catch (error) {
          console.error(`Failed to move task ${taskId}:`, error);
        }
      }
      if (successCount === 0) throw new Error('Failed to move any tasks');

      const taskCount = successCount;
      toast.success(
        taskCount > 1 ? `${taskCount} tasks completed` : 'Task completed',
        {
          description:
            taskCount > 1
              ? `Tasks marked as ${targetCompletionList.status === 'done' ? 'done' : 'closed'}`
              : `Task marked as ${targetCompletionList.status === 'done' ? 'done' : 'closed'} and moved to ${targetCompletionList.name}`,
        }
      );

      // NOTE: No invalidation needed - optimistic update already handles the UI
      // and realtime subscription handles cross-user sync
    } catch (error) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      console.error('Failed to move task to completion:', error);
      toast.error('Error', {
        description: 'Failed to complete task. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [
    targetCompletionList,
    onUpdate,
    task.id,
    setIsLoading,
    setMenuOpen,
    isMultiSelectMode,
    selectedTasks,
    queryClient,
    boardId,
  ]);

  const handleMoveToClose = useCallback(async () => {
    if (!targetClosedList || !onUpdate) return;

    setIsLoading(true);

    // Check if we're in multi-select mode and have multiple tasks selected
    const shouldBulkMove =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);
    const tasksToMove = shouldBulkMove ? Array.from(selectedTasks) : [task.id];

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

    const supabase = createClient();
    try {
      // Optimistic update: move tasks to closed list and set closed_at
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          const now = new Date().toISOString();
          return old.map((t) =>
            tasksToMove.includes(t.id)
              ? {
                  ...t,
                  list_id: targetClosedList.id,
                  closed_at: now,
                }
              : t
          );
        }
      );

      // Move tasks one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of tasksToMove) {
        try {
          await moveTask(supabase, taskId, targetClosedList.id);
          successCount++;
        } catch (error) {
          console.error(`Failed to move task ${taskId}:`, error);
        }
      }
      if (successCount === 0) throw new Error('Failed to move any tasks');

      const taskCount = successCount;
      toast.success('Success', {
        description:
          taskCount > 1
            ? `${taskCount} tasks marked as closed`
            : 'Task marked as closed',
      });

      // NOTE: No invalidation needed - optimistic update already handles the UI
      // and realtime subscription handles cross-user sync
    } catch (error) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      console.error('Failed to move task to closed:', error);
      toast.error('Error', {
        description: 'Failed to close task. Please try again.',
      });
    } finally {
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [
    targetClosedList,
    onUpdate,
    task.id,
    setIsLoading,
    setMenuOpen,
    isMultiSelectMode,
    selectedTasks,
    queryClient,
    boardId,
  ]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);

    // Check if we're in multi-select mode and have multiple tasks selected
    const shouldBulkDelete =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);
    const tasksToDelete = shouldBulkDelete
      ? Array.from(selectedTasks)
      : [task.id];

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

    // Optimistic update: remove tasks from cache
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return old;
      return old.filter((t) => !tasksToDelete.includes(t.id));
    });

    const supabase = createClient();
    try {
      // Delete tasks one by one to ensure triggers fire for each task
      let successCount = 0;
      for (const taskId of tasksToDelete) {
        const { error } = await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', taskId);
        if (error) {
          console.error(`Failed to delete task ${taskId}:`, error);
        } else {
          successCount++;
        }
      }
      if (successCount === 0) throw new Error('Failed to delete any tasks');

      const taskCount = tasksToDelete.length;
      toast.success('Success', {
        description:
          taskCount > 1
            ? `${taskCount} tasks deleted`
            : 'Task deleted successfully',
      });

      setDeleteDialogOpen?.(false);

      queryClient.invalidateQueries({ queryKey: ['deleted-tasks', boardId] });
    } catch (error) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      console.error('Failed to delete task(s):', error);
      toast.error('Error', {
        description: 'Failed to delete task(s). Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    task.id,
    setIsLoading,
    setDeleteDialogOpen,
    isMultiSelectMode,
    selectedTasks,
    queryClient,
    boardId,
  ]);

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
  }, [
    task.id,
    task.assignees,
    boardId,
    queryClient,
    setIsLoading,
    setMenuOpen,
  ]);

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

      // Store previous state for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      // Determine if target list is a completion list
      const targetList = availableLists.find(
        (list) => list.id === targetListId
      );
      const isCompletionList =
        targetList?.status === 'done' || targetList?.status === 'closed';
      const now = new Date().toISOString();

      try {
        // Optimistic update: move tasks to target list
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (tasksToMove.includes(t.id)) {
                // Determine the current list status
                const currentList = availableLists.find(
                  (list) => list.id === t.list_id
                );
                const wasInCompletionList =
                  currentList?.status === 'done' ||
                  currentList?.status === 'closed';

                return {
                  ...t,
                  list_id: targetListId,
                  // Set closed_at based on target list status
                  closed_at: isCompletionList
                    ? now
                    : wasInCompletionList
                      ? null
                      : t.closed_at,
                  completed_at:
                    targetList?.status === 'done'
                      ? now
                      : wasInCompletionList
                        ? null
                        : t.completed_at,
                };
              }
              return t;
            });
          }
        );

        // Move tasks one by one to ensure triggers fire for each task
        let successCount = 0;
        for (const taskId of tasksToMove) {
          try {
            await moveTask(supabase, taskId, targetListId);
            successCount++;
          } catch (error) {
            console.error(`Failed to move task ${taskId}:`, error);
          }
        }
        if (successCount === 0) throw new Error('Failed to move any tasks');

        const taskCount = successCount;
        toast.success('Success', {
          description:
            taskCount > 1
              ? `${taskCount} tasks moved to ${targetList?.name || 'selected list'}`
              : `Task moved to ${targetList?.name || 'selected list'}`,
        });

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync
      } catch (error) {
        // Rollback on error
        if (previousTasks) {
          queryClient.setQueryData(['tasks', boardId], previousTasks);
        }
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
      setIsLoading,
      setMenuOpen,
      isMultiSelectMode,
      selectedTasks,
      queryClient,
      boardId,
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
          // Update one by one to ensure triggers fire for each task
          let successCount = 0;
          for (const taskId of tasksToUpdate) {
            const { error } = await supabase
              .from('tasks')
              .update({ end_date: newDate })
              .eq('id', taskId);
            if (error) {
              console.error(
                `Failed to update due date for task ${taskId}:`,
                error
              );
            } else {
              successCount++;
            }
          }
          if (successCount === 0) throw new Error('Failed to update any tasks');
          console.log(`✅ Updated ${successCount} tasks with due date`);
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
          console.log('🔄 Executing sequential Supabase updates:', {
            tasksToUpdate,
            count: tasksToUpdate.length,
            priority: newPriority,
          });

          // Update one by one to ensure triggers fire for each task
          let successCount = 0;
          for (const taskId of tasksToUpdate) {
            const { error } = await supabase
              .from('tasks')
              .update({ priority: newPriority })
              .eq('id', taskId);
            if (error) {
              console.error(
                `Failed to update priority for task ${taskId}:`,
                error
              );
            } else {
              successCount++;
            }
          }

          console.log('✅ Sequential update result:', {
            successCount,
            totalTasks: tasksToUpdate.length,
          });

          if (successCount === 0) throw new Error('Failed to update any tasks');
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

      // Get current tasks from cache to filter out ones that already have the target value
      const currentTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);

      // Filter tasks that actually need updating (don't already have the target estimation)
      const candidateTasks = shouldBulkUpdate
        ? Array.from(selectedTasks)
        : [task.id];

      const tasksToUpdate = currentTasks
        ? candidateTasks.filter((taskId) => {
            const taskData = currentTasks.find((t) => t.id === taskId);
            return taskData?.estimation_points !== points;
          })
        : candidateTasks;

      // If no tasks actually need updating, skip
      if (tasksToUpdate.length === 0) {
        return;
      }

      setEstimationSaving?.(true);

      // Store previous state for rollback
      const previousTasks = currentTasks;

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
        if (tasksToUpdate.length > 1) {
          const supabase = createClient();
          // Update one by one to ensure triggers fire for each task
          let successCount = 0;
          for (const taskId of tasksToUpdate) {
            const { error } = await supabase
              .from('tasks')
              .update({ estimation_points: points })
              .eq('id', taskId);
            if (error) {
              console.error(
                `Failed to update estimation for task ${taskId}:`,
                error
              );
            } else {
              successCount++;
            }
          }
          if (successCount === 0) throw new Error('Failed to update any tasks');
          console.log(
            `✅ Updated ${successCount} tasks with estimation points`
          );
        } else {
          // Use mutation for single task
          await updateTaskMutation.mutateAsync({
            taskId: tasksToUpdate[0]!,
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
        let successCount = 0;

        if (active) {
          // Remove assignee one by one to ensure triggers fire for each task
          for (const taskId of tasksToRemoveFrom) {
            const { error } = await supabase
              .from('task_assignees')
              .delete()
              .eq('task_id', taskId)
              .eq('user_id', assigneeId);
            if (error) {
              console.error(
                `Failed to remove assignee from task ${taskId}:`,
                error
              );
            } else {
              successCount++;
            }
          }
        } else {
          // Add assignee one by one to ensure triggers fire for each task
          for (const taskId of tasksNeedingAssignee) {
            const { error } = await supabase
              .from('task_assignees')
              .insert({ task_id: taskId, user_id: assigneeId });

            // Ignore duplicate key errors (code '23505' for unique_violation)
            if (error && error.code !== '23505') {
              console.error(`Failed to add assignee to task ${taskId}:`, error);
            } else {
              successCount++;
            }
          }
        }

        // If no operations succeeded, throw to trigger rollback
        const targetCount = active
          ? tasksToRemoveFrom.length
          : tasksNeedingAssignee.length;
        if (targetCount > 0 && successCount === 0) {
          throw new Error('Failed to update any tasks');
        }

        // NOTE: No invalidation needed - optimistic update already handles the UI
        // and realtime subscription handles cross-user sync

        toast.success(active ? 'Assignee removed' : 'Assignee added', {
          description:
            successCount > 1 ? `${successCount} tasks updated` : undefined,
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
    [
      task.id,
      task.assignees,
      boardId,
      queryClient,
      setIsLoading,
      isMultiSelectMode,
      selectedTasks,
    ]
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
