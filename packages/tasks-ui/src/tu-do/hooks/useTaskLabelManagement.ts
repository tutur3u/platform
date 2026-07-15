import { useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceTaskLabel,
  createWorkspaceLabel,
  removeWorkspaceTaskLabel,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { TaskLabel as DbTaskLabel } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import {
  getActiveBoardRefresh,
  useBoardBroadcast,
} from '../shared/board-broadcast-context';
import {
  getTaskFromVisibleCaches,
  patchTaskInVisibleCaches,
  restoreTasksFromVisibleCacheSnapshot,
  restoreVisibleTaskCaches,
  snapshotVisibleTaskCaches,
} from '../shared/task-cache-patches';
import { getRandomNewLabelColor } from '../utils/taskConstants';

type WorkspaceTaskLabel = Pick<
  DbTaskLabel,
  'id' | 'name' | 'color' | 'created_at'
>;

interface UseTaskLabelManagementProps {
  task: Task;
  boardId: string;
  workspaceLabels: WorkspaceTaskLabel[];
  workspaceId?: string;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  onClearSelection?: () => void;
  taskId?: string; // Optional task ID for syncing individual task cache
  labelCacheWorkspaceIds?: Array<string | undefined>;
}

export function useTaskLabelManagement({
  task,
  boardId,
  workspaceLabels,
  workspaceId,
  selectedTasks,
  isMultiSelectMode,
  taskId,
  labelCacheWorkspaceIds,
}: UseTaskLabelManagementProps) {
  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(() =>
    getRandomNewLabelColor()
  );
  const [creatingLabel, setCreatingLabel] = useState(false);

  const getLabelCacheWorkspaceIds = () =>
    Array.from(
      new Set(
        [workspaceId, ...(labelCacheWorkspaceIds ?? [])].filter(
          (id): id is string => Boolean(id)
        )
      )
    );

  // Toggle a label for the task (quick labels submenu)
  async function toggleTaskLabel(labelId: string) {
    if (!workspaceId) {
      toast.error('Error', {
        description:
          'Workspace context is missing. Please refresh and try again.',
      });
      return;
    }

    // CRITICAL: Get current task state from cache instead of stale prop
    // This ensures we read the most up-to-date state after optimistic updates
    const canonicalTaskId = taskId ?? task.id;
    const currentTask =
      getTaskFromVisibleCaches({
        queryClient,
        boardId,
        taskId: canonicalTaskId,
        fallback: task,
      }) ?? task;

    // Check if we're in multi-select mode with multiple tasks selected
    const shouldBulkUpdate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(currentTask.id);

    const tasksToUpdate = shouldBulkUpdate
      ? Array.from(selectedTasks)
      : [currentTask.id];

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
    await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });

    // Snapshot the previous value BEFORE optimistic update
    const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;
    const cacheSnapshot = snapshotVisibleTaskCaches(
      queryClient,
      boardId,
      tasksToUpdate
    );

    // Determine action: remove if ALL selected tasks have the label, add otherwise
    // Use currentTask from cache, not stale task prop
    let active = currentTask.labels?.some((l) => l.id === labelId) ?? false;

    if (shouldBulkUpdate && previousTasks) {
      const selectedTasksData = previousTasks.filter((t) =>
        selectedTasks?.has(t.id)
      );
      // Only mark as active (to remove) if ALL selected tasks have the label
      active = selectedTasksData.every(
        (t) => t.labels?.some((l) => l.id === labelId) ?? false
      );
    }

    // Helper to get task from either board cache or individual cache
    const getTaskState = (taskId: string): Task | undefined => {
      // First try board cache
      const fromBoardCache = previousTasks?.find((ct) => ct.id === taskId);
      if (fromBoardCache) return fromBoardCache;

      const fromVisibleCaches = getTaskFromVisibleCaches({
        queryClient,
        boardId,
        taskId,
      });
      if (fromVisibleCaches) return fromVisibleCaches;

      // Fallback to individual task cache (for tasks not in board view)
      if (taskId === currentTask.id) return currentTask;

      return undefined;
    };

    // Pre-calculate which tasks actually need to change
    const tasksNeedingLabel = !active
      ? tasksToUpdate.filter((taskId) => {
          const t = getTaskState(taskId);
          return !t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    const tasksToRemoveFrom = active
      ? tasksToUpdate.filter((taskId) => {
          const t = getTaskState(taskId);
          return t?.labels?.some((l) => l.id === labelId);
        })
      : [];

    // Get label details from workspace labels for optimistic update
    const label = workspaceLabels.find((l) => l.id === labelId);
    const fallbackLabel = label || {
      id: labelId,
      name: 'Unknown',
      color: '#3b82f6',
      created_at: new Date().toISOString(),
    };

    // Optimistically update the cache - only update tasks that actually change
    for (const tid of active ? tasksToRemoveFrom : tasksNeedingLabel) {
      patchTaskInVisibleCaches({
        queryClient,
        boardId,
        taskId: tid,
        updater: (cachedTask) => {
          if (active) {
            return {
              ...cachedTask,
              labels: cachedTask.labels?.filter((l) => l.id !== labelId) || [],
            };
          }

          if (cachedTask.labels?.some((l) => l.id === labelId)) {
            return cachedTask;
          }

          return {
            ...cachedTask,
            labels: [...(cachedTask.labels || []), fallbackLabel],
          };
        },
      });
    }

    try {
      const internalApiOptions =
        typeof window !== 'undefined'
          ? { baseUrl: window.location.origin }
          : undefined;
      let successCount = 0;
      const succeededTaskIds: string[] = [];

      if (active) {
        for (const tid of tasksToRemoveFrom) {
          try {
            await removeWorkspaceTaskLabel(
              workspaceId,
              tid,
              labelId,
              internalApiOptions
            );
            successCount++;
            succeededTaskIds.push(tid);
          } catch (error) {
            console.error(`Failed to remove label from task ${tid}:`, error);
          }
        }
      } else {
        for (const tid of tasksNeedingLabel) {
          try {
            await addWorkspaceTaskLabel(
              workspaceId,
              tid,
              labelId,
              internalApiOptions
            );
            successCount++;
            succeededTaskIds.push(tid);
          } catch (error) {
            console.error(`Failed to add label to task ${tid}:`, error);
          }
        }
      }

      // If no operations succeeded, throw to trigger rollback
      const targetCount = active
        ? tasksToRemoveFrom.length
        : tasksNeedingLabel.length;
      if (targetCount > 0 && successCount === 0) {
        throw new Error('Failed to update any tasks');
      }

      const failedTaskIds = (
        active ? tasksToRemoveFrom : tasksNeedingLabel
      ).filter((tid) => !succeededTaskIds.includes(tid));
      restoreTasksFromVisibleCacheSnapshot({
        queryClient,
        snapshot: cacheSnapshot,
        taskIds: failedTaskIds,
      });

      // Broadcast relation changes for all affected tasks
      for (const tid of succeededTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }
      if (succeededTaskIds.length > 0) {
        getActiveBoardRefresh()?.({ invalidateTasks: false });
      }

      toast.success(active ? 'Label removed' : 'Label added', {
        description:
          successCount > 1 ? `${successCount} tasks updated` : undefined,
      });

      // Don't auto-clear selection - let user manually clear with "Clear" button
    } catch (e: any) {
      // Rollback on error
      restoreVisibleTaskCaches(queryClient, cacheSnapshot);
      console.error('Failed to toggle label:', e);
      toast.error('Error', {
        description: 'Failed to update label. Please try again.',
      });
    }
  }

  // Create a new label
  async function createNewLabel() {
    if (!newLabelName.trim() || !workspaceId) return;

    setCreatingLabel(true);
    try {
      const newLabel = await createWorkspaceLabel(
        workspaceId,
        {
          name: newLabelName.trim(),
          color: newLabelColor,
        },
        typeof window !== 'undefined'
          ? { baseUrl: window.location.origin }
          : undefined
      );

      // Optimistically add the new label to ALL workspace labels caches
      // Note: Two different query keys are used across the codebase
      for (const cacheWorkspaceId of getLabelCacheWorkspaceIds()) {
        queryClient.setQueryData(
          ['workspace-labels', cacheWorkspaceId],
          (old: WorkspaceTaskLabel[] | undefined) => {
            if (!old) return [newLabel];
            if (old.some((l) => l.id === newLabel.id)) return old;
            const updated = [newLabel, ...old];
            return updated.sort((a, b) =>
              a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            );
          }
        );
        queryClient.setQueryData(
          ['workspace_task_labels', cacheWorkspaceId],
          (old: WorkspaceTaskLabel[] | undefined) => {
            if (!old) return [newLabel];
            if (old.some((l) => l.id === newLabel.id)) return old;
            return [newLabel, ...old];
          }
        );
      }

      // Auto-apply the newly created label to this task
      let linkSucceeded = false;
      const canonicalTaskId = taskId ?? task.id;
      let cacheSnapshot:
        | ReturnType<typeof snapshotVisibleTaskCaches>
        | undefined;
      try {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
        await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });

        // Snapshot the previous value
        cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
          canonicalTaskId,
        ]);

        // Optimistically update the cache
        patchTaskInVisibleCaches({
          queryClient,
          boardId,
          taskId: canonicalTaskId,
          updater: (cachedTask) => {
            if (cachedTask.labels?.some((label) => label.id === newLabel.id)) {
              return cachedTask;
            }

            return {
              ...cachedTask,
              labels: [...(cachedTask.labels || []), newLabel],
            };
          },
        });

        const taskState =
          getTaskFromVisibleCaches({
            queryClient,
            boardId,
            taskId: canonicalTaskId,
            fallback: task,
          }) ?? task;
        const nextLabelIds = [
          ...new Set([
            ...(taskState.labels ?? []).map((entry) => entry.id),
            newLabel.id,
          ]),
        ];

        await updateWorkspaceTask(
          workspaceId,
          canonicalTaskId,
          {
            label_ids: nextLabelIds,
          },
          typeof window !== 'undefined'
            ? { baseUrl: window.location.origin }
            : undefined
        );
        linkSucceeded = true;
      } catch (linkErr: any) {
        // Rollback on error
        if (cacheSnapshot) {
          restoreVisibleTaskCaches(queryClient, cacheSnapshot);
        }
        toast.error(
          'The label was created but could not be attached to the task. Refresh and try manually.'
        );
        console.error('Failed to auto-apply new label', linkErr);
      }

      // Only show success toast and reset form if link succeeded
      if (linkSucceeded) {
        broadcast?.('task:relations-changed', { taskId: canonicalTaskId });
        getActiveBoardRefresh()?.({ invalidateTasks: false });

        // Reset form and close dialog
        setNewLabelName('');
        setNewLabelColor((previousColor) =>
          getRandomNewLabelColor(previousColor)
        );

        toast.success(
          `"${newLabel.name}" label created and applied to this task`
        );
      }

      // ✅ NO invalidation - workspace labels cache already updated optimistically above

      return newLabel;
    } catch (e: any) {
      toast.error(e.message || 'Unable to create new label');
      throw e;
    } finally {
      setCreatingLabel(false);
    }
  }

  return {
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,
    creatingLabel,
    toggleTaskLabel,
    createNewLabel,
  };
}
