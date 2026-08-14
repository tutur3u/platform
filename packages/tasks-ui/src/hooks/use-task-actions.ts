import { useQueryClient } from '@tanstack/react-query';
import {
  resolveTaskProjectWorkspaceId,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import {
  isTaskBoardCompletedStatus,
  isTaskBoardResolvedStatus,
  isTaskBoardTerminalStatus,
} from '@tuturuuu/utils/task-list-status';
import { addDays } from 'date-fns';
import { useCallback } from 'react';
import { invalidateKanbanDeadlineTasks } from '../tu-do/boards/boardId/kanban/data/kanban-deadline-query';
import { useBoardBroadcast } from '../tu-do/shared/board-broadcast-context';
import {
  applyOptimisticTaskPatch,
  getTaskFromVisibleCaches,
  patchTaskInVisibleCaches,
  patchTasksInVisibleCaches,
  restoreTaskFieldsFromVisibleCacheSnapshot,
  restoreTasksFromVisibleCacheSnapshot,
  restoreVisibleTaskCaches,
  settleOptimisticTaskPatch,
  snapshotVisibleTaskCaches,
} from '../tu-do/shared/task-cache-patches';
import {
  dispatchTaskSoundCue,
  type TaskSoundCue,
} from '../tu-do/shared/task-sound-effects';
import {
  isPersonalExternalTask,
  moveExternalTaskToPersonalList,
  shouldMoveExternalTaskToCompletion,
} from './task-actions-personal-external';
import { updateTaskMetadata } from './task-metadata-updates';

interface UseTaskActionsProps {
  task?: Task; // Made optional to handle loading states
  boardId: string;
  workspaceId?: string;
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
  taskId?: string; // Optional task ID for syncing individual task cache
  // Bulk operation functions from useBulkOperations hook
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
}

function dispatchTaskActionSound(cue: TaskSoundCue, count = 1) {
  dispatchTaskSoundCue({
    cue,
    count,
    intensity: count > 1 ? 1.15 : 1,
  });
}

function getMoveSoundCue(targetList?: TaskList | null): TaskSoundCue {
  return isTaskBoardCompletedStatus(targetList?.status) ||
    isTaskBoardTerminalStatus(targetList?.status)
    ? 'complete'
    : 'move';
}

export function useTaskActions({
  task,
  boardId,
  workspaceId,
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
  taskId,
  bulkUpdateCustomDueDate,
}: UseTaskActionsProps) {
  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();
  const invalidateDeadlineTasks = useCallback(() => {
    void invalidateKanbanDeadlineTasks(queryClient, boardId);
  }, [boardId, queryClient]);

  const resolveWorkspaceIdForTask = useCallback(
    async (taskRecord?: Task) => {
      const sourceWorkspaceId = taskRecord?.source_workspace_id ?? undefined;
      const taskWorkspaceId =
        (taskRecord as Task & { ws_id?: string })?.ws_id ??
        (
          taskRecord as Task & {
            task_lists?: { workspace_boards?: { ws_id?: string } };
          }
        )?.task_lists?.workspace_boards?.ws_id;
      const resolvedWorkspaceId =
        sourceWorkspaceId ??
        taskWorkspaceId ??
        (boardId
          ? await resolveTaskProjectWorkspaceId({ boardId }).catch(() => null)
          : null) ??
        workspaceId;

      if (!resolvedWorkspaceId) {
        throw new Error('Workspace ID is required');
      }

      return resolvedWorkspaceId;
    },
    [boardId, workspaceId]
  );

  const getWorkspaceId = useCallback(async () => {
    return resolveWorkspaceIdForTask(task);
  }, [resolveWorkspaceIdForTask, task]);

  const getEffectiveTaskIds = useCallback(
    (taskRecord?: Task) => {
      if (!taskRecord) return [];

      if (
        isMultiSelectMode &&
        selectedTasks &&
        selectedTasks.size > 1 &&
        selectedTasks.has(taskRecord.id)
      ) {
        return Array.from(selectedTasks);
      }

      return [taskRecord.id];
    },
    [isMultiSelectMode, selectedTasks]
  );

  const updateTaskIds = useCallback(
    (
      taskIds: string[],
      payload: Parameters<typeof updateTaskMetadata>[0]['payload']
    ) =>
      updateTaskMetadata({
        queryClient,
        boardId,
        taskIds,
        payload,
        fallbackTask: task,
        resolveWorkspaceId: resolveWorkspaceIdForTask,
      }),
    [boardId, queryClient, resolveWorkspaceIdForTask, task]
  );

  const getExternalMoveOptions = useCallback((targetList: TaskList) => {
    const options: {
      sourceStatus?: TaskBoardStatus;
      placementPosition: 'top' | 'end';
    } = {
      placementPosition: isTaskBoardResolvedStatus(targetList.status)
        ? 'top'
        : 'end',
    };

    if (isTaskBoardTerminalStatus(targetList.status)) {
      options.sourceStatus = targetList.status;
    }

    return options;
  }, []);

  const markLocallyMutatedTask = useCallback((taskRecord: Task): Task => {
    return {
      ...(taskRecord as Task & { _localMutationAt?: number }),
      _localMutationAt: Date.now(),
    } as Task;
  }, []);

  const mergeLocallyMutatedTask = useCallback(
    (taskId: string, taskPatch: Partial<Task>) => {
      patchTaskInVisibleCaches({
        boardId,
        queryClient,
        taskId,
        updater: (item) =>
          markLocallyMutatedTask({ ...item, ...taskPatch } as Task),
      });
    },
    [boardId, markLocallyMutatedTask, queryClient]
  );

  const patchLocallyMutatedTasks = useCallback(
    (taskIds: string[], updater: (task: Task) => Task) => {
      patchTasksInVisibleCaches({
        boardId,
        queryClient,
        taskIds,
        updater: (item) => markLocallyMutatedTask(updater(item)),
      });
    },
    [boardId, markLocallyMutatedTask, queryClient]
  );

  const rollbackTaskIds = useCallback(
    (previousTasks: Task[] | undefined, failedTaskIds: string[]) => {
      if (!previousTasks || failedTaskIds.length === 0) {
        return;
      }

      const previousTaskMap = new Map(
        previousTasks.map((item) => [item.id, item])
      );

      queryClient.setQueryData<Task[]>(['tasks', boardId], (current) => {
        if (!current) {
          return current;
        }

        return current.map((item) =>
          failedTaskIds.includes(item.id)
            ? previousTaskMap.get(item.id) || item
            : item
        );
      });
    },
    [boardId, queryClient]
  );

  const restoreDeletedTaskIds = useCallback(
    (
      previousTasks: Task[] | undefined,
      previousDeletedTasks: Task[] | undefined,
      failedTaskIds: string[]
    ) => {
      if (!previousTasks || failedTaskIds.length === 0) {
        return;
      }

      const failedTaskIdSet = new Set(failedTaskIds);
      const failedTasks = previousTasks.filter((item) =>
        failedTaskIdSet.has(item.id)
      );

      queryClient.setQueryData<Task[]>(['tasks', boardId], (current) => {
        if (!current) {
          return failedTasks;
        }

        const currentIds = new Set(current.map((item) => item.id));
        const restoredTasks = failedTasks.filter(
          (item) => !currentIds.has(item.id)
        );
        return [...restoredTasks, ...current];
      });

      queryClient.setQueryData<Task[]>(
        ['deleted-tasks', boardId],
        (current) => {
          if (!current) {
            return previousDeletedTasks;
          }

          return current.filter((item) => !failedTaskIdSet.has(item.id));
        }
      );
    },
    [boardId, queryClient]
  );

  const handleArchiveToggle = useCallback(async () => {
    if (!task || !onUpdate) return;
    setIsLoading(true);

    const shouldMoveExternalToCompletion = shouldMoveExternalTaskToCompletion(
      task,
      targetCompletionList
    );
    const newClosedState = shouldMoveExternalToCompletion || !task.closed_at;

    const previousCaches = snapshotVisibleTaskCaches(queryClient, boardId, [
      task.id,
    ]);

    if (shouldMoveExternalToCompletion && targetCompletionList) {
      try {
        await moveExternalTaskToPersonalList({
          boardId,
          markLocallyMutatedTask,
          queryClient,
          task,
          targetList: targetCompletionList,
          sourceStatus:
            targetCompletionList.status === 'closed' ? 'closed' : 'done',
          placementPosition: 'top',
        });

        toast.success('Task completed', {
          description: `Task marked as ${targetCompletionList.status === 'done' ? 'done' : 'closed'} and moved to ${targetCompletionList.name}`,
        });
        dispatchTaskActionSound('complete');
        invalidateDeadlineTasks();
      } catch (error) {
        console.error('Failed to complete external task:', error);
        toast.error('Error', {
          description: 'Failed to complete task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (
      newClosedState &&
      targetCompletionList &&
      targetCompletionList.id !== task.list_id
    ) {
      const now = new Date().toISOString();

      try {
        // Optimistic update: move task to completion list and set closed_at
        patchLocallyMutatedTasks(
          [task.id],
          (item) =>
            ({
              ...item,
              list_id: targetCompletionList.id,
              completed: targetCompletionList.status === 'done',
              closed_at: now,
              completed_at: targetCompletionList.status === 'done' ? now : null,
            }) as Task
        );

        // moveTask handles setting archived status based on target list
        const workspaceId = await getWorkspaceId();

        const { task: movedTask } = await updateWorkspaceTask(
          workspaceId,
          task.id,
          {
            list_id: targetCompletionList.id,
          }
        );
        mergeLocallyMutatedTask(task.id, {
          ...movedTask,
          list_id: targetCompletionList.id,
          closed_at: movedTask?.closed_at ?? now,
          completed_at:
            movedTask?.completed_at ??
            (targetCompletionList.status === 'done' ? now : undefined),
        });
        broadcast?.('task:upsert', {
          task: {
            id: task.id,
            list_id: targetCompletionList.id,
            completed_at: movedTask?.completed_at,
            closed_at: movedTask?.closed_at,
          },
        });
        invalidateDeadlineTasks();

        toast.success('Task completed', {
          description: `Task marked as done and moved to ${targetCompletionList.name}`,
        });
        dispatchTaskActionSound('complete');
      } catch (error) {
        // Rollback on error
        restoreVisibleTaskCaches(queryClient, previousCaches);
        console.error('Failed to complete task:', error);
        toast.error('Error', {
          description: 'Failed to complete task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // Optimistic update for simple toggle
      patchLocallyMutatedTasks(
        [task.id],
        (item) =>
          ({
            ...item,
            closed_at: newClosedState ? new Date().toISOString() : null,
          }) as Task
      );

      try {
        const workspaceId = await getWorkspaceId();

        const { task: updatedTask } = await updateWorkspaceTask(
          workspaceId,
          task.id,
          {
            closed_at: newClosedState ? new Date().toISOString() : null,
          }
        );
        mergeLocallyMutatedTask(task.id, {
          ...updatedTask,
          closed_at: updatedTask.closed_at,
          completed_at: updatedTask.completed_at,
        });

        broadcast?.('task:upsert', {
          task: {
            id: task.id,
            closed_at: updatedTask.closed_at,
            completed_at: updatedTask.completed_at,
          },
        });
        dispatchTaskActionSound(newClosedState ? 'complete' : 'update');
        invalidateDeadlineTasks();
      } catch (error) {
        // Rollback on error
        restoreVisibleTaskCaches(queryClient, previousCaches);
        console.error('Failed to toggle task status:', error);
        toast.error('Error', {
          description: 'Failed to update task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [
    task?.id,
    task?.closed_at,
    task?.list_id,
    targetCompletionList,
    onUpdate,
    setIsLoading,
    queryClient,
    boardId,
    task,
    broadcast,
    getWorkspaceId,
    markLocallyMutatedTask,
    mergeLocallyMutatedTask,
    patchLocallyMutatedTasks,
    invalidateDeadlineTasks,
  ]);

  const handleMoveToCompletion = useCallback(async () => {
    if (!task || !targetCompletionList || !onUpdate) return;

    setIsLoading(true);

    const tasksToMove = getEffectiveTaskIds(task);
    const shouldBulkMove = tasksToMove.length > 1;

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
    const previousCaches = snapshotVisibleTaskCaches(
      queryClient,
      boardId,
      tasksToMove
    );

    try {
      if (isPersonalExternalTask(task) && !shouldBulkMove) {
        await moveExternalTaskToPersonalList({
          boardId,
          markLocallyMutatedTask,
          queryClient,
          task,
          targetList: targetCompletionList,
          sourceStatus:
            targetCompletionList.status === 'closed' ? 'closed' : 'done',
          placementPosition: 'top',
        });

        toast.success('Task completed', {
          description: `Task marked as ${targetCompletionList.status === 'done' ? 'done' : 'closed'} and moved to ${targetCompletionList.name}`,
        });
        dispatchTaskActionSound('complete');
        invalidateDeadlineTasks();
        return;
      }

      // Optimistic update: move tasks to completion list and set closed_at/completed_at
      const now = new Date().toISOString();
      patchLocallyMutatedTasks(tasksToMove, (item) => ({
        ...item,
        list_id: targetCompletionList.id,
        closed_at: now,
        completed_at:
          targetCompletionList.status === 'done' ? now : item.completed_at,
      }));

      // Move tasks one by one to ensure triggers fire for each task
      let successCount = 0;
      const workspaceId = await getWorkspaceId();
      const failedTaskIds: string[] = [];
      const previousTaskMap = new Map(
        previousTasks?.map((item) => [item.id, item]) ?? []
      );

      for (const taskId of tasksToMove) {
        try {
          const { task: movedTask } = await updateWorkspaceTask(
            workspaceId,
            taskId,
            {
              list_id: targetCompletionList.id,
            }
          );
          broadcast?.('task:upsert', {
            task: {
              id: taskId,
              list_id: targetCompletionList.id,
              completed_at: movedTask?.completed_at,
              closed_at: movedTask?.closed_at,
            },
          });
          successCount++;
        } catch (error) {
          failedTaskIds.push(taskId);
          restoreTasksFromVisibleCacheSnapshot({
            queryClient,
            snapshot: previousCaches,
            taskIds: [taskId],
          });
          const previousTask = previousTaskMap.get(taskId);
          if (previousTask) {
            broadcast?.('task:upsert', { task: previousTask });
          }
          console.error(`Failed to move task ${taskId}:`, error);
        }
      }
      if (successCount === 0) throw new Error('Failed to move any tasks');
      invalidateDeadlineTasks();

      if (failedTaskIds.length > 0) {
        toast.warning('Partial completion update', {
          description: `${successCount}/${tasksToMove.length} tasks updated`,
        });
        dispatchTaskActionSound('complete', successCount);
        return;
      }

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
      dispatchTaskActionSound('complete', taskCount);
    } catch (error) {
      // Rollback on error
      restoreVisibleTaskCaches(queryClient, previousCaches);
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
    task?.id,
    setIsLoading,
    setMenuOpen,
    getEffectiveTaskIds,
    queryClient,
    boardId,
    task,
    broadcast,
    getWorkspaceId,
    markLocallyMutatedTask,
    patchLocallyMutatedTasks,
    invalidateDeadlineTasks,
  ]);

  const handleMoveToClose = useCallback(async () => {
    if (!task || !targetClosedList || !onUpdate) return;

    setIsLoading(true);

    const tasksToMove = getEffectiveTaskIds(task);
    const shouldBulkMove = tasksToMove.length > 1;

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
    const previousCaches = snapshotVisibleTaskCaches(
      queryClient,
      boardId,
      tasksToMove
    );

    try {
      if (isPersonalExternalTask(task) && !shouldBulkMove) {
        await moveExternalTaskToPersonalList({
          boardId,
          markLocallyMutatedTask,
          queryClient,
          task,
          targetList: targetClosedList,
          sourceStatus: 'closed',
          placementPosition: 'top',
        });

        toast.success('Success', {
          description: 'Task marked as closed',
        });
        dispatchTaskActionSound('complete');
        invalidateDeadlineTasks();
        return;
      }

      // Optimistic update: move tasks to closed list and set closed_at
      const now = new Date().toISOString();
      patchLocallyMutatedTasks(tasksToMove, (item) => ({
        ...item,
        list_id: targetClosedList.id,
        closed_at: now,
      }));

      // Move tasks one by one to ensure triggers fire for each task
      let successCount = 0;
      const workspaceId = await getWorkspaceId();
      const failedTaskIds: string[] = [];
      const previousTaskMap = new Map(
        previousTasks?.map((item) => [item.id, item]) ?? []
      );

      for (const taskId of tasksToMove) {
        try {
          const { task: movedTask } = await updateWorkspaceTask(
            workspaceId,
            taskId,
            {
              list_id: targetClosedList.id,
            }
          );
          broadcast?.('task:upsert', {
            task: {
              id: taskId,
              list_id: targetClosedList.id,
              completed_at: movedTask?.completed_at,
              closed_at: movedTask?.closed_at,
            },
          });
          successCount++;
        } catch (error) {
          failedTaskIds.push(taskId);
          restoreTasksFromVisibleCacheSnapshot({
            queryClient,
            snapshot: previousCaches,
            taskIds: [taskId],
          });
          const previousTask = previousTaskMap.get(taskId);
          if (previousTask) {
            broadcast?.('task:upsert', { task: previousTask });
          }
          console.error(`Failed to move task ${taskId}:`, error);
        }
      }
      if (successCount === 0) throw new Error('Failed to move any tasks');
      invalidateDeadlineTasks();

      if (failedTaskIds.length > 0) {
        toast.warning('Partial close update', {
          description: `${successCount}/${tasksToMove.length} tasks updated`,
        });
        dispatchTaskActionSound('complete', successCount);
        return;
      }

      const taskCount = successCount;
      toast.success('Success', {
        description:
          taskCount > 1
            ? `${taskCount} tasks marked as closed`
            : 'Task marked as closed',
      });
      dispatchTaskActionSound('complete', taskCount);
    } catch (error) {
      // Rollback on error
      restoreVisibleTaskCaches(queryClient, previousCaches);
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
    task?.id,
    setIsLoading,
    setMenuOpen,
    getEffectiveTaskIds,
    queryClient,
    boardId,
    task,
    broadcast,
    getWorkspaceId,
    markLocallyMutatedTask,
    patchLocallyMutatedTasks,
    invalidateDeadlineTasks,
  ]);

  const handleDelete = useCallback(async () => {
    if (!task) return;
    setIsLoading(true);

    const tasksToDelete = getEffectiveTaskIds(task);

    const now = new Date().toISOString();

    // Store previous state for rollback
    const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
    const previousDeletedTasks = queryClient.getQueryData<Task[]>([
      'deleted-tasks',
      boardId,
    ]);

    // Optimistic update: remove tasks from cache
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return old;
      return old.filter((t) => !tasksToDelete.includes(t.id));
    });

    // Optimistic update: add tasks to recycle bin cache
    if (previousTasks?.length) {
      const deletedTaskRecords = tasksToDelete
        .map((id) => previousTasks.find((t) => t.id === id))
        .filter((t): t is Task => Boolean(t))
        .map((t) => ({ ...t, deleted_at: now }));

      if (deletedTaskRecords.length) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          (old: Task[] | undefined) => {
            const existingIds = new Set(old?.map((t) => t.id) ?? []);
            const toAdd = deletedTaskRecords.filter(
              (t) => !existingIds.has(t.id)
            );
            if (!old) return toAdd;
            return [...toAdd, ...old];
          }
        );
      }
    }

    try {
      let successCount = 0;
      const workspaceId = await getWorkspaceId();
      const failedTaskIds: string[] = [];
      const previousTaskMap = new Map(
        previousTasks?.map((item) => [item.id, item]) ?? []
      );

      for (const tid of tasksToDelete) {
        try {
          await updateWorkspaceTask(workspaceId, tid, {
            deleted: true,
          });
          broadcast?.('task:delete', { taskId: tid });
          successCount++;
        } catch (error) {
          failedTaskIds.push(tid);
          restoreDeletedTaskIds(previousTasks, previousDeletedTasks, [tid]);
          const previousTask = previousTaskMap.get(tid);
          if (previousTask) {
            broadcast?.('task:upsert', { task: previousTask });
          }
          console.error(`Failed to delete task ${tid}:`, error);
        }
      }

      if (successCount === 0) throw new Error('Failed to delete any tasks');
      invalidateDeadlineTasks();

      if (failedTaskIds.length > 0) {
        toast.warning('Partial delete update', {
          description: `${successCount}/${tasksToDelete.length} tasks deleted`,
        });
        dispatchTaskActionSound('delete', successCount);
        return;
      }

      const taskCount = tasksToDelete.length;
      toast.success('Success', {
        description:
          taskCount > 1
            ? `${taskCount} tasks deleted`
            : 'Task deleted successfully',
      });
      dispatchTaskActionSound('delete', taskCount);

      setDeleteDialogOpen?.(false);
    } catch (error) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      if (previousDeletedTasks) {
        queryClient.setQueryData(
          ['deleted-tasks', boardId],
          previousDeletedTasks
        );
      }
      console.error('Failed to delete task(s):', error);
      toast.error('Error', {
        description: 'Failed to delete task(s). Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    task?.id,
    setIsLoading,
    setDeleteDialogOpen,
    getEffectiveTaskIds,
    queryClient,
    boardId,
    task,
    broadcast,
    getWorkspaceId,
    restoreDeletedTaskIds,
    invalidateDeadlineTasks,
  ]);

  const handleRemoveAllAssignees = useCallback(async () => {
    if (!task?.assignees || task.assignees.length === 0) return;

    setIsLoading(true);
    const cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
      task.id,
    ]);
    const mutationId = applyOptimisticTaskPatch({
      queryClient,
      boardId,
      taskIds: [task.id],
      updater: (cachedTask) => ({ ...cachedTask, assignees: [] }),
    });
    let mutationFailed = false;

    try {
      const workspaceId = await getWorkspaceId();

      await updateWorkspaceTask(workspaceId, task.id, {
        assignee_ids: [],
      });

      broadcast?.('task:relations-changed', { taskId: task.id });

      toast.success('Success', {
        description: 'All assignees removed from task',
      });
      dispatchTaskActionSound('update');
    } catch (error) {
      mutationFailed = true;
      restoreTaskFieldsFromVisibleCacheSnapshot({
        queryClient,
        boardId,
        snapshot: cacheSnapshot,
        taskIds: [task.id],
        restore: (currentTask, previousTask) => ({
          ...currentTask,
          assignees: previousTask.assignees,
        }),
      });
      console.error('Failed to remove all assignees:', error);
      toast.error('Error', {
        description: 'Failed to remove assignees. Please try again.',
      });
    } finally {
      settleOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [task.id],
        mutationId,
        clearLocalMutationAt: mutationFailed,
      });
      setIsLoading(false);
      setMenuOpen(false);
    }
  }, [
    task?.id,
    task?.assignees,
    boardId,
    queryClient,
    setIsLoading,
    setMenuOpen,
    task,
    broadcast,
    getWorkspaceId,
  ]);

  const handleRemoveAssignee = useCallback(
    async (assigneeId: string) => {
      if (!task) return;
      setIsLoading(true);
      const cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
        task.id,
      ]);
      const previousTask = getTaskFromVisibleCaches({
        queryClient,
        boardId,
        taskId: task.id,
        fallback: task,
      });
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [task.id],
        updater: (cachedTask) => ({
          ...cachedTask,
          assignees:
            cachedTask.assignees?.filter((a) => a.id !== assigneeId) || [],
        }),
      });
      let mutationFailed = false;

      try {
        const newIds =
          previousTask?.assignees?.map((a) => a.id).filter(Boolean) ??
          task.assignees?.map((a) => a.id).filter(Boolean) ??
          [];
        const filteredIds = newIds.filter((id) => id !== assigneeId);

        const workspaceId = await getWorkspaceId();

        await updateWorkspaceTask(workspaceId, task.id, {
          assignee_ids: filteredIds,
        });

        const assignee = task.assignees?.find((a) => a.id === assigneeId);
        toast.success('Success', {
          description: `${assignee?.display_name || assignee?.email || 'Assignee'} removed from task`,
        });
        broadcast?.('task:relations-changed', { taskId: task.id });
        dispatchTaskActionSound('update');
      } catch (error) {
        mutationFailed = true;
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: [task.id],
          restore: (currentTask, cachedPreviousTask) => ({
            ...currentTask,
            assignees: cachedPreviousTask.assignees,
          }),
        });
        console.error('Failed to remove assignee:', error);
        toast.error('Error', {
          description: 'Failed to remove assignee. Please try again.',
        });
      } finally {
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: [task.id],
          mutationId,
          clearLocalMutationAt: mutationFailed,
        });
        setIsLoading(false);
        setMenuOpen(false);
      }
    },
    [
      task,
      boardId,
      queryClient,
      setIsLoading,
      setMenuOpen,
      broadcast,
      getWorkspaceId,
    ]
  );

  const handleMoveToList = useCallback(
    async (targetListId: string) => {
      if (!task) return;
      if (targetListId === task.list_id) {
        setMenuOpen(false);
        return;
      }

      setIsLoading(true);

      const tasksToMove = getEffectiveTaskIds(task);
      const shouldBulkMove = tasksToMove.length > 1;

      // Store previous state for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      // Determine if target list represents resolved workflow state
      const targetList = availableLists.find(
        (list) => list.id === targetListId
      );
      const isTargetCompletedList = isTaskBoardCompletedStatus(
        targetList?.status
      );
      const isTargetTerminalList = isTaskBoardTerminalStatus(
        targetList?.status
      );
      const now = new Date().toISOString();
      const previousTaskMap = new Map(
        previousTasks?.map((item) => [item.id, item]) ?? []
      );
      const selectedTaskById = new Map<string, Task>();

      for (const taskId of tasksToMove) {
        const selectedTask = previousTaskMap.get(taskId) ?? task;
        if (selectedTask.id === taskId) {
          selectedTaskById.set(taskId, selectedTask);
        }
      }

      const externalTaskById = new Map(
        targetList
          ? [...selectedTaskById.values()]
              .filter((selectedTask) => isPersonalExternalTask(selectedTask))
              .map((selectedTask) => [selectedTask.id, selectedTask] as const)
          : []
      );
      const localTaskIdsToMove = tasksToMove.filter(
        (taskId) => !externalTaskById.has(taskId)
      );

      if (isPersonalExternalTask(task) && !shouldBulkMove && targetList) {
        try {
          await moveExternalTaskToPersonalList({
            boardId,
            markLocallyMutatedTask,
            queryClient,
            task,
            targetList,
            ...getExternalMoveOptions(targetList),
          });

          toast.success('Success', {
            description: `Task moved to ${targetList.name || 'selected list'}`,
          });
          dispatchTaskActionSound(getMoveSoundCue(targetList));
          invalidateDeadlineTasks();
        } catch (error) {
          console.error('Failed to move external task:', error);
          toast.error('Error', {
            description: 'Failed to move task. Please try again.',
          });
        } finally {
          setIsLoading(false);
          setMenuOpen(false);
        }
        return;
      }

      try {
        // Optimistic update: move tasks to target list
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (localTaskIdsToMove.includes(t.id)) {
                const currentList = availableLists.find(
                  (list) => list.id === t.list_id
                );
                const wasInCompletionList = isTaskBoardResolvedStatus(
                  currentList?.status
                );
                const isMovingToReview = targetList?.status === 'review';

                return markLocallyMutatedTask({
                  ...t,
                  list_id: targetListId,
                  completed: isTargetCompletedList,
                  closed_at: isTargetTerminalList
                    ? (t.closed_at ?? now)
                    : wasInCompletionList || isMovingToReview
                      ? null
                      : t.closed_at,
                  completed_at: isTargetCompletedList
                    ? (t.completed_at ?? now)
                    : wasInCompletionList || isMovingToReview
                      ? null
                      : t.completed_at,
                } as Task);
              }
              return t;
            });
          }
        );

        // Move tasks one by one to ensure triggers fire for each task
        let successCount = 0;
        const failedTaskIds: string[] = [];
        for (const taskId of tasksToMove) {
          try {
            const externalTask = externalTaskById.get(taskId);

            if (externalTask && targetList) {
              await moveExternalTaskToPersonalList({
                boardId,
                markLocallyMutatedTask,
                queryClient,
                task: externalTask,
                targetList,
                ...getExternalMoveOptions(targetList),
              });
              broadcast?.('task:upsert', {
                task: {
                  id: taskId,
                  list_id: targetListId,
                },
              });
              successCount++;
              continue;
            }

            const selectedTask = selectedTaskById.get(taskId);
            const taskWorkspaceId =
              await resolveWorkspaceIdForTask(selectedTask);
            const { task: movedTask } = await updateWorkspaceTask(
              taskWorkspaceId,
              taskId,
              {
                list_id: targetListId,
              }
            );
            broadcast?.('task:upsert', {
              task: {
                id: taskId,
                list_id: targetListId,
                completed_at: movedTask?.completed_at,
                closed_at: movedTask?.closed_at,
              },
            });
            successCount++;
          } catch (error) {
            failedTaskIds.push(taskId);
            rollbackTaskIds(previousTasks, [taskId]);
            const previousTask = previousTaskMap.get(taskId);
            if (previousTask) {
              broadcast?.('task:upsert', { task: previousTask });
            }
            console.error(`Failed to move task ${taskId}:`, error);
          }
        }
        if (successCount === 0) throw new Error('Failed to move any tasks');
        invalidateDeadlineTasks();

        if (failedTaskIds.length > 0) {
          toast.warning('Partial move update', {
            description: `${successCount}/${tasksToMove.length} tasks updated`,
          });
          dispatchTaskActionSound(getMoveSoundCue(targetList), successCount);
          return;
        }

        const taskCount = successCount;
        toast.success('Success', {
          description:
            taskCount > 1
              ? `${taskCount} tasks moved to ${targetList?.name || 'selected list'}`
              : `Task moved to ${targetList?.name || 'selected list'}`,
        });
        dispatchTaskActionSound(getMoveSoundCue(targetList), taskCount);
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
      task?.id,
      task?.list_id,
      availableLists,
      setIsLoading,
      setMenuOpen,
      getEffectiveTaskIds,
      queryClient,
      boardId,
      task,
      broadcast,
      getExternalMoveOptions,
      markLocallyMutatedTask,
      resolveWorkspaceIdForTask,
      rollbackTaskIds,
      invalidateDeadlineTasks,
    ]
  );

  const handleDueDateChange = useCallback(
    async (days: number | null) => {
      if (!task) return;
      let newDate: string | null = null;
      if (days !== null) {
        const target = addDays(new Date(), days);
        target.setHours(23, 59, 59, 999);
        newDate = target.toISOString();
      }

      const tasksToUpdate = getEffectiveTaskIds(task);

      setIsLoading(true);

      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        boardId,
        tasksToUpdate
      );
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: tasksToUpdate,
        updater: (cachedTask) => ({ ...cachedTask, end_date: newDate }),
      });

      try {
        const { succeededTaskIds, failedTaskIds } = await updateTaskIds(
          tasksToUpdate,
          { end_date: newDate }
        );

        if (succeededTaskIds.length === 0) {
          throw new Error('Failed to update any tasks');
        }

        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: failedTaskIds,
          restore: (currentTask, previousTask) => ({
            ...currentTask,
            end_date: previousTask.end_date,
          }),
        });

        for (const tid of succeededTaskIds) {
          broadcast?.('task:upsert', {
            task: { id: tid, end_date: newDate },
          });
        }
        invalidateDeadlineTasks();

        if (failedTaskIds.length > 0) {
          toast.warning('Partial due date update', {
            description: `${succeededTaskIds.length}/${tasksToUpdate.length} tasks updated`,
          });
          dispatchTaskActionSound('update', succeededTaskIds.length);
        } else {
          const taskCount = tasksToUpdate.length;
          toast.success('Due date updated', {
            description:
              taskCount > 1
                ? `${taskCount} tasks updated`
                : newDate
                  ? 'Due date set successfully'
                  : 'Due date removed',
          });
          dispatchTaskActionSound('update', taskCount);
        }
      } catch (error) {
        console.error('Failed to update due date:', error);
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: tasksToUpdate,
          restore: (currentTask, previousTask) => ({
            ...currentTask,
            end_date: previousTask.end_date,
          }),
        });
        toast.error('Error', {
          description: 'Failed to update due date. Please try again.',
        });
      } finally {
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: tasksToUpdate,
          mutationId,
        });
        setIsLoading(false);
      }
    },
    [
      task?.id,
      setIsLoading,
      getEffectiveTaskIds,
      queryClient,
      boardId,
      task,
      broadcast,
      invalidateDeadlineTasks,
      updateTaskIds,
    ]
  );

  const handlePriorityChange = useCallback(
    async (newPriority: TaskPriority | null) => {
      if (!task) return;
      if (newPriority === task.priority && !isMultiSelectMode) return;

      const tasksToUpdate = getEffectiveTaskIds(task);

      setIsLoading(true);

      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        boardId,
        tasksToUpdate
      );
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: tasksToUpdate,
        updater: (cachedTask) => ({
          ...cachedTask,
          priority: newPriority,
        }),
      });

      try {
        const { succeededTaskIds, failedTaskIds } = await updateTaskIds(
          tasksToUpdate,
          { priority: newPriority }
        );

        if (succeededTaskIds.length === 0) {
          throw new Error('Failed to update any tasks');
        }

        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: failedTaskIds,
          restore: (currentTask, previousTask) => ({
            ...currentTask,
            priority: previousTask.priority,
          }),
        });

        for (const tid of succeededTaskIds) {
          broadcast?.('task:upsert', {
            task: { id: tid, priority: newPriority },
          });
        }

        if (failedTaskIds.length > 0) {
          toast.warning('Partial priority update', {
            description: `${succeededTaskIds.length}/${tasksToUpdate.length} tasks updated`,
          });
          dispatchTaskActionSound('update', succeededTaskIds.length);
        } else {
          const taskCount = tasksToUpdate.length;
          toast.success('Priority updated', {
            description:
              taskCount > 1
                ? `${taskCount} tasks updated`
                : newPriority
                  ? 'Priority changed'
                  : 'Priority cleared',
          });
          dispatchTaskActionSound('update', taskCount);
        }
      } catch (error) {
        console.error('Failed to update priority:', error);
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: tasksToUpdate,
          restore: (currentTask, previousTask) => ({
            ...currentTask,
            priority: previousTask.priority,
          }),
        });
        toast.error('Error', {
          description: 'Failed to update priority. Please try again.',
        });
      } finally {
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: tasksToUpdate,
          mutationId,
        });
        setIsLoading(false);
      }
    },
    [
      task?.id,
      task?.priority,
      setIsLoading,
      getEffectiveTaskIds,
      queryClient,
      boardId,
      task,
      broadcast,
      isMultiSelectMode,
      updateTaskIds,
    ]
  );

  const updateEstimationPoints = useCallback(
    async (points: number | null) => {
      if (!task) return;
      if (points === task.estimation_points && !isMultiSelectMode) return;

      const candidateTasks = getEffectiveTaskIds(task);
      const tasksToUpdate = candidateTasks.filter((candidateTaskId) => {
        const taskData = getTaskFromVisibleCaches({
          queryClient,
          boardId,
          taskId: candidateTaskId,
          fallback: candidateTaskId === task.id ? task : undefined,
        });
        return taskData?.estimation_points !== points;
      });

      if (tasksToUpdate.length === 0) {
        return;
      }

      setEstimationSaving?.(true);

      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        boardId,
        tasksToUpdate
      );
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: tasksToUpdate,
        updater: (cachedTask) => ({
          ...cachedTask,
          estimation_points: points,
        }),
      });

      try {
        const { succeededTaskIds: succeededIds, failedTaskIds: failedIds } =
          await updateTaskIds(tasksToUpdate, {
            estimation_points: points,
          });

        if (succeededIds.length === 0) {
          throw new Error('Failed to update any tasks');
        }

        if (failedIds.length > 0) {
          restoreTaskFieldsFromVisibleCacheSnapshot({
            queryClient,
            boardId,
            snapshot: cacheSnapshot,
            taskIds: failedIds,
            restore: (currentTask, previousTask) => ({
              ...currentTask,
              estimation_points: previousTask.estimation_points,
            }),
          });

          for (const tid of succeededIds) {
            broadcast?.('task:upsert', {
              task: { id: tid, estimation_points: points },
            });
          }

          toast.warning('Partial estimation update', {
            description: `${succeededIds.length}/${tasksToUpdate.length} tasks updated`,
          });
          dispatchTaskActionSound('update', succeededIds.length);

          return;
        }

        for (const tid of succeededIds) {
          broadcast?.('task:upsert', {
            task: { id: tid, estimation_points: points },
          });
        }

        const taskCount = succeededIds.length;
        toast.success('Estimation updated', {
          description:
            taskCount > 1
              ? `${taskCount} tasks updated`
              : 'Estimation points updated successfully',
        });
        dispatchTaskActionSound('update', taskCount);

        return;
      } catch (e: any) {
        console.error('Failed to update estimation', e);
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: tasksToUpdate,
          restore: (currentTask, previousTask) => ({
            ...currentTask,
            estimation_points: previousTask.estimation_points,
          }),
        });
        toast.error('Failed to update estimation', {
          description: e.message || 'Please try again',
        });
      } finally {
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: tasksToUpdate,
          mutationId,
        });
        setEstimationSaving?.(false);
      }
    },
    [
      task?.id,
      task?.estimation_points,
      setEstimationSaving,
      isMultiSelectMode,
      getEffectiveTaskIds,
      queryClient,
      boardId,
      task,
      broadcast,
      updateTaskIds,
    ]
  );

  const handleCustomDateChange = useCallback(
    async (date: Date | undefined) => {
      if (!task) return;
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

      const shouldBulkUpdate = getEffectiveTaskIds(task).length > 1;

      if (shouldBulkUpdate && bulkUpdateCustomDueDate) {
        try {
          await bulkUpdateCustomDueDate(date || null);
          invalidateDeadlineTasks();
        } catch (error) {
          console.error('Bulk custom date update failed', error);
          toast.error('Failed to update due date for selected tasks');
        } finally {
          setIsLoading(false);
        }
      } else {
        const cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
          task.id,
        ]);
        const mutationId = applyOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: [task.id],
          updater: (cachedTask) => ({ ...cachedTask, end_date: newDate }),
        });

        try {
          const { succeededTaskIds } = await updateTaskIds([task.id], {
            end_date: newDate,
          });
          if (succeededTaskIds.length === 0) {
            throw new Error('Failed to update task');
          }

          broadcast?.('task:upsert', {
            task: { id: task.id, end_date: newDate },
          });
          invalidateDeadlineTasks();

          toast.success('Due date updated', {
            description: newDate
              ? 'Custom due date set successfully'
              : 'Due date removed',
          });
          dispatchTaskActionSound('update');
        } catch (error) {
          restoreTaskFieldsFromVisibleCacheSnapshot({
            queryClient,
            boardId,
            snapshot: cacheSnapshot,
            taskIds: [task.id],
            restore: (currentTask, previousTask) => ({
              ...currentTask,
              end_date: previousTask.end_date,
            }),
          });
          console.error('Failed to update due date:', error);
          toast.error('Failed to update due date. Please try again.');
        } finally {
          settleOptimisticTaskPatch({
            queryClient,
            boardId,
            taskIds: [task.id],
            mutationId,
          });
          setIsLoading(false);
        }
      }
    },
    [
      task?.id,
      setIsLoading,
      setCustomDateDialogOpen,
      getEffectiveTaskIds,
      bulkUpdateCustomDueDate,
      task,
      queryClient,
      boardId,
      broadcast,
      invalidateDeadlineTasks,
      updateTaskIds,
    ]
  );

  const handleToggleAssignee = useCallback(
    async (assigneeId: string) => {
      if (!task) return;

      const currentTask = taskId
        ? ((queryClient.getQueryData(['task', taskId]) as Task | undefined) ??
          task)
        : task;

      const tasksToUpdate = getEffectiveTaskIds(currentTask);
      const shouldBulkUpdate = tasksToUpdate.length > 1;

      setIsLoading(true);
      const previousTasks = tasksToUpdate
        .map((targetTaskId) =>
          getTaskFromVisibleCaches({
            queryClient,
            boardId,
            taskId: targetTaskId,
            fallback: targetTaskId === currentTask.id ? currentTask : undefined,
          })
        )
        .filter((cachedTask): cachedTask is Task => Boolean(cachedTask));
      const cacheSnapshot = snapshotVisibleTaskCaches(
        queryClient,
        boardId,
        tasksToUpdate
      );

      let active = currentTask.assignees?.some((a) => a.id === assigneeId);

      if (shouldBulkUpdate && previousTasks) {
        const selectedTasksData = previousTasks.filter((t) =>
          tasksToUpdate.includes(t.id)
        );
        active = selectedTasksData.every((t) =>
          t.assignees?.some((a) => a.id === assigneeId)
        );
      }

      const getTaskState = (taskId: string): Task | undefined => {
        const fromBoardCache = previousTasks?.find((ct) => ct.id === taskId);
        if (fromBoardCache) return fromBoardCache;

        if (taskId === currentTask.id) return currentTask;

        return undefined;
      };

      const tasksNeedingAssignee = !active
        ? tasksToUpdate.filter((taskId) => {
            const t = getTaskState(taskId);
            return !t?.assignees?.some((a) => a.id === assigneeId);
          })
        : [];

      const tasksToRemoveFrom = active
        ? tasksToUpdate.filter((taskId) => {
            const t = getTaskState(taskId);
            return t?.assignees?.some((a) => a.id === assigneeId);
          })
        : [];

      let assigneeDetails = null;
      if (!active) {
        if (previousTasks) {
          for (const t of previousTasks) {
            const found = t.assignees?.find((a) => a.id === assigneeId);
            if (found) {
              assigneeDetails = found;
              break;
            }
          }
        }
        if (!assigneeDetails && currentTask.assignees) {
          assigneeDetails =
            currentTask.assignees.find((a) => a.id === assigneeId) || null;
        }
      }

      const targetTasks = active ? tasksToRemoveFrom : tasksNeedingAssignee;
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: targetTasks,
        updater: (cachedTask) => {
          if (active) {
            return {
              ...cachedTask,
              assignees:
                cachedTask.assignees?.filter((a) => a.id !== assigneeId) || [],
            };
          }

          return {
            ...cachedTask,
            assignees: [
              ...(cachedTask.assignees || []),
              assigneeDetails || {
                id: assigneeId,
                display_name: 'User',
                email: '',
              },
            ],
          };
        },
      });
      let mutationFailed = false;

      try {
        const succeededTaskIds: string[] = [];
        const settledResults = await Promise.allSettled(
          targetTasks.map(async (tid) => {
            const current = getTaskState(tid);
            const existingIds =
              current?.assignees
                ?.map((assignee) => assignee.id)
                .filter(Boolean) ?? [];
            const newIds = active
              ? existingIds.filter((id) => id !== assigneeId)
              : Array.from(new Set([...existingIds, assigneeId]));
            const targetWorkspaceId = await resolveWorkspaceIdForTask(current);
            await updateWorkspaceTask(targetWorkspaceId, tid, {
              assignee_ids: newIds,
            });
            return tid;
          })
        );
        settledResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            succeededTaskIds.push(result.value);
          } else {
            console.error('Failed to update task assignee:', result.reason);
          }
        });

        if (targetTasks.length > 0 && succeededTaskIds.length === 0) {
          throw new Error('Failed to update any tasks');
        }

        const failedTaskIds = targetTasks.filter(
          (id) => !succeededTaskIds.includes(id)
        );
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: failedTaskIds,
          restore: (cachedTask, previousTask) => ({
            ...cachedTask,
            assignees: previousTask.assignees,
          }),
        });

        for (const tid of succeededTaskIds) {
          broadcast?.('task:relations-changed', { taskId: tid });
        }

        const selectedAssignee = task.assignees?.find(
          (a) => a.id === assigneeId
        );
        const assigneeName =
          selectedAssignee?.display_name ||
          selectedAssignee?.email ||
          'Assignee';
        toast.success(active ? 'Assignee removed' : 'Assignee added', {
          description:
            succeededTaskIds.length > 1
              ? `${succeededTaskIds.length} tasks updated`
              : `${assigneeName} ${active ? 'removed' : 'added'} on task`,
        });
        if (succeededTaskIds.length > 0) {
          dispatchTaskActionSound('update', succeededTaskIds.length);
        }
      } catch (e: any) {
        mutationFailed = true;
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: cacheSnapshot,
          taskIds: targetTasks,
          restore: (cachedTask, previousTask) => ({
            ...cachedTask,
            assignees: previousTask.assignees,
          }),
        });
        console.error('Failed to toggle assignee:', e);
        toast.error('Error', {
          description: 'Failed to update assignee. Please try again.',
        });
      } finally {
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: targetTasks,
          mutationId,
          clearLocalMutationAt: mutationFailed,
        });
        setIsLoading(false);
      }
    },
    [
      task,
      taskId,
      boardId,
      queryClient,
      setIsLoading,
      getEffectiveTaskIds,
      broadcast,
      resolveWorkspaceIdForTask,
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
