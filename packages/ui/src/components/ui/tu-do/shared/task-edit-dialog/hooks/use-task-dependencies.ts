'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
} from '@tuturuuu/types/primitives/TaskRelationship';
import { toast } from '@tuturuuu/ui/sonner';
import {
  useCreateTaskRelationship,
  useCreateTaskWithRelationship,
  useDeleteTaskRelationship,
  useTaskRelationships,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';
import {
  getActiveBroadcast,
  useBoardBroadcast,
} from '../../board-broadcast-context';

export interface UseTaskDependenciesProps {
  taskId?: string;
  boardId: string;
  wsId: string;
  listId?: string;
  isCreateMode: boolean;
  onUpdate?: () => void;
}

export interface UseTaskDependenciesReturn {
  // Data
  relationships: TaskRelationshipsResponse | null | undefined;
  isLoading: boolean;

  // Parent task
  parentTask: RelatedTaskInfo | null;
  setParentTask: (task: RelatedTaskInfo | null) => Promise<void>;
  createParentTask: (name: string) => Promise<void>;

  // Child tasks
  childTasks: RelatedTaskInfo[];
  addChildTask: (task: RelatedTaskInfo) => Promise<void>;
  removeChildTask: (taskId: string) => Promise<void>;

  // Blocking relationships
  blocking: RelatedTaskInfo[];
  addBlockingTask: (task: RelatedTaskInfo) => Promise<void>;
  removeBlockingTask: (taskId: string) => Promise<void>;
  createBlockingTask: (name: string) => Promise<void>;

  // Blocked by relationships
  blockedBy: RelatedTaskInfo[];
  addBlockedByTask: (task: RelatedTaskInfo) => Promise<void>;
  removeBlockedByTask: (taskId: string) => Promise<void>;
  createBlockedByTask: (name: string) => Promise<void>;

  // Related tasks
  relatedTasks: RelatedTaskInfo[];
  addRelatedTask: (task: RelatedTaskInfo) => Promise<void>;
  removeRelatedTask: (taskId: string) => Promise<void>;
  createRelatedTask: (name: string) => Promise<void>;

  // Loading states
  savingRelationship: string | null;
}

/**
 * Custom hook for managing task dependencies/relationships
 * Handles parent-child, blocking, blocked-by, and related task relationships
 */
export function useTaskDependencies({
  taskId,
  boardId,
  wsId,
  listId,
  isCreateMode,
  onUpdate,
}: UseTaskDependenciesProps): UseTaskDependenciesReturn {
  const queryClient = useQueryClient();
  const contextBroadcast = useBoardBroadcast();
  const broadcast = contextBroadcast ?? getActiveBroadcast();

  const [savingRelationship, setSavingRelationship] = useState<string | null>(
    null
  );

  // Pending relationships for create mode (not yet saved to DB)
  const [pendingParent, setPendingParent] = useState<RelatedTaskInfo | null>(
    null
  );
  const [pendingChildren, setPendingChildren] = useState<RelatedTaskInfo[]>([]);
  const [pendingBlocking, setPendingBlocking] = useState<RelatedTaskInfo[]>([]);
  const [pendingBlockedBy, setPendingBlockedBy] = useState<RelatedTaskInfo[]>(
    []
  );
  const [pendingRelated, setPendingRelated] = useState<RelatedTaskInfo[]>([]);

  // Fetch relationships from server
  const { data: relationships, isLoading } = useTaskRelationships(
    isCreateMode ? undefined : taskId
  );

  // Mutations
  const createRelationship = useCreateTaskRelationship(boardId);
  const deleteRelationship = useDeleteTaskRelationship(boardId);
  const createTaskWithRelationship = useCreateTaskWithRelationship(
    boardId,
    wsId
  );

  // Helper to invalidate relationship caches and broadcast changes.
  // NOTE: We intentionally do NOT invalidate ['tasks', boardId] here —
  // the kanban board relies on realtime sync via setQueryData, and
  // invalidating the full task list causes all tasks to disappear briefly.
  const invalidateCaches = useCallback(
    async (otherTaskId?: string) => {
      await Promise.all([
        taskId &&
          queryClient.invalidateQueries({
            queryKey: ['task-relationships', taskId],
          }),
        otherTaskId &&
          queryClient.invalidateQueries({
            queryKey: ['task-relationships', otherTaskId],
          }),
      ]);

      // Broadcast dependency changes to other clients
      const ids = [taskId, otherTaskId].filter(Boolean) as string[];
      if (ids.length > 0) {
        broadcast?.('task:deps-changed', { taskIds: ids });
      }

      onUpdate?.();
    },
    [taskId, queryClient, onUpdate, broadcast]
  );

  // =========================================================================
  // Parent Task Operations
  // =========================================================================

  const setParentTask = useCallback(
    async (task: RelatedTaskInfo | null) => {
      if (isCreateMode) {
        setPendingParent(task);
        return;
      }

      if (!taskId) return;

      setSavingRelationship('parent');
      try {
        // If we already have a parent, remove it first
        if (relationships?.parentTask) {
          await deleteRelationship.mutateAsync({
            sourceTaskId: relationships.parentTask.id,
            targetTaskId: taskId,
            type: 'parent_child',
          });
        }

        // If setting a new parent, create the relationship
        if (task) {
          await createRelationship.mutateAsync({
            source_task_id: task.id, // Parent is source
            target_task_id: taskId, // This task is child
            type: 'parent_child',
          });
          toast.success(
            `Parent set: This task is now a sub-task of "${task.name}"`
          );
        } else {
          toast.success('Parent removed: This task is no longer a sub-task');
        }

        await invalidateCaches(task?.id);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Unable to update parent task';
        toast.error(`Failed to update parent: ${message}`);
      } finally {
        setSavingRelationship(null);
      }
    },
    [
      isCreateMode,
      taskId,
      relationships?.parentTask,
      deleteRelationship,
      createRelationship,
      invalidateCaches,
    ]
  );

  /**
   * Create a new task and set it as the parent of the current task
   */
  const createParentTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast.error('Cannot create parent task: Task must be saved first');
        return;
      }

      setSavingRelationship('create-parent');
      try {
        // If we already have a parent, remove it first
        if (relationships?.parentTask) {
          await deleteRelationship.mutateAsync({
            sourceTaskId: relationships.parentTask.id,
            targetTaskId: taskId,
            type: 'parent_child',
          });
        }

        // Create new parent task + relationship
        const result = await createTaskWithRelationship.mutateAsync({
          name,
          listId,
          currentTaskId: taskId,
          relationshipType: 'parent_child',
          currentTaskIsSource: false, // New task (parent) is source, current task is target (child)
        });

        toast.success(
          `Parent task created: "${name}" is now the parent of this task`
        );

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast.error(
          `Failed to create parent task: ${e.message || 'Unable to create parent task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [
      isCreateMode,
      taskId,
      listId,
      relationships?.parentTask,
      deleteRelationship,
      createTaskWithRelationship,
      invalidateCaches,
    ]
  );

  // =========================================================================
  // Child Task Operations
  // =========================================================================

  const addChildTask = useCallback(
    async (task: RelatedTaskInfo) => {
      if (isCreateMode) {
        setPendingChildren((prev) => [...prev, task]);
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`child-${task.id}`);
      try {
        await createRelationship.mutateAsync({
          source_task_id: taskId, // This task is parent
          target_task_id: task.id, // Selected task is child
          type: 'parent_child',
        });
        toast.success(`Sub-task added: "${task.name}" is now a sub-task`);
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast.error(
          `Failed to add sub-task: ${e.message || 'Unable to add sub-task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, invalidateCaches]
  );

  const removeChildTask = useCallback(
    async (childTaskId: string) => {
      if (isCreateMode) {
        setPendingChildren((prev) => prev.filter((t) => t.id !== childTaskId));
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`child-${childTaskId}`);
      try {
        await deleteRelationship.mutateAsync({
          sourceTaskId: taskId, // This task is parent
          targetTaskId: childTaskId, // The child being removed
          type: 'parent_child',
        });
        toast.success('Sub-task removed: Task is no longer a sub-task');
        await invalidateCaches(childTaskId);
      } catch (e: any) {
        toast.error(
          `Failed to remove sub-task: ${e.message || 'Unable to remove sub-task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, invalidateCaches]
  );

  // =========================================================================
  // Blocking Task Operations (this task blocks others)
  // =========================================================================

  const addBlockingTask = useCallback(
    async (task: RelatedTaskInfo) => {
      if (isCreateMode) {
        setPendingBlocking((prev) => [...prev, task]);
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`blocking-${task.id}`);
      try {
        await createRelationship.mutateAsync({
          source_task_id: taskId, // This task blocks
          target_task_id: task.id, // The blocked task
          type: 'blocks',
        });
        toast.success(
          `Blocking relationship added: This task now blocks "${task.name}"`
        );
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast.error(
          `Failed to add blocking relationship: ${e.message || 'Unable to add blocking relationship'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, invalidateCaches]
  );

  const removeBlockingTask = useCallback(
    async (blockedTaskId: string) => {
      if (isCreateMode) {
        setPendingBlocking((prev) =>
          prev.filter((t) => t.id !== blockedTaskId)
        );
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`blocking-${blockedTaskId}`);
      try {
        await deleteRelationship.mutateAsync({
          sourceTaskId: taskId,
          targetTaskId: blockedTaskId,
          type: 'blocks',
        });
        toast.success(
          'Blocking relationship removed: Task is no longer blocked by this task'
        );
        await invalidateCaches(blockedTaskId);
      } catch (e: any) {
        toast.error(
          `Failed to remove blocking relationship: ${e.message || 'Unable to remove blocking relationship'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, invalidateCaches]
  );

  /**
   * Create a new task that this task blocks
   */
  const createBlockingTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast.error('Cannot create task: Task must be saved first');
        return;
      }

      setSavingRelationship('create-blocking');
      try {
        const result = await createTaskWithRelationship.mutateAsync({
          name,
          listId,
          currentTaskId: taskId,
          relationshipType: 'blocks',
          currentTaskIsSource: true, // Current task blocks the new task
        });

        toast.success(`Blocking task created: This task now blocks "${name}"`);

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast.error(
          `Failed to create blocking task: ${e.message || 'Unable to create task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, invalidateCaches]
  );

  // =========================================================================
  // Blocked By Task Operations (this task is blocked by others)
  // =========================================================================

  const addBlockedByTask = useCallback(
    async (task: RelatedTaskInfo) => {
      if (isCreateMode) {
        setPendingBlockedBy((prev) => [...prev, task]);
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`blocked-by-${task.id}`);
      try {
        await createRelationship.mutateAsync({
          source_task_id: task.id, // The blocking task
          target_task_id: taskId, // This task is blocked
          type: 'blocks',
        });
        toast.success(
          `Dependency added: This task is now blocked by "${task.name}"`
        );
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast.error(
          `Failed to add dependency: ${e.message || 'Unable to add dependency'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, invalidateCaches]
  );

  const removeBlockedByTask = useCallback(
    async (blockingTaskId: string) => {
      if (isCreateMode) {
        setPendingBlockedBy((prev) =>
          prev.filter((t) => t.id !== blockingTaskId)
        );
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`blocked-by-${blockingTaskId}`);
      try {
        await deleteRelationship.mutateAsync({
          sourceTaskId: blockingTaskId,
          targetTaskId: taskId,
          type: 'blocks',
        });
        toast.success('Dependency removed: This task is no longer blocked');
        await invalidateCaches(blockingTaskId);
      } catch (e: any) {
        toast.error(
          `Failed to remove dependency: ${e.message || 'Unable to remove dependency'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, invalidateCaches]
  );

  /**
   * Create a new task that blocks this task
   */
  const createBlockedByTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast.error('Cannot create task: Task must be saved first');
        return;
      }

      setSavingRelationship('create-blocked-by');
      try {
        const result = await createTaskWithRelationship.mutateAsync({
          name,
          listId,
          currentTaskId: taskId,
          relationshipType: 'blocks',
          currentTaskIsSource: false, // New task blocks current task (new is source)
        });

        toast.success(
          `Blocking task created: This task is now blocked by "${name}"`
        );

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast.error(
          `Failed to create blocking task: ${e.message || 'Unable to create task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, invalidateCaches]
  );

  // =========================================================================
  // Related Task Operations
  // =========================================================================

  const addRelatedTask = useCallback(
    async (task: RelatedTaskInfo) => {
      if (isCreateMode) {
        setPendingRelated((prev) => [...prev, task]);
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`related-${task.id}`);
      try {
        await createRelationship.mutateAsync({
          source_task_id: taskId,
          target_task_id: task.id,
          type: 'related',
        });
        toast.success(`Related task added: "${task.name}" is now linked`);
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast.error(
          `Failed to add related task: ${e.message || 'Unable to add related task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, invalidateCaches]
  );

  const removeRelatedTask = useCallback(
    async (relatedTaskId: string) => {
      if (isCreateMode) {
        setPendingRelated((prev) => prev.filter((t) => t.id !== relatedTaskId));
        return;
      }

      if (!taskId) return;

      setSavingRelationship(`related-${relatedTaskId}`);
      try {
        // Try both directions since related is bidirectional
        await deleteRelationship.mutateAsync({
          sourceTaskId: taskId,
          targetTaskId: relatedTaskId,
          type: 'related',
        });
        toast.success('Related task removed: Tasks are no longer linked');
        await invalidateCaches(relatedTaskId);
      } catch {
        // If first direction fails, try the other
        try {
          await deleteRelationship.mutateAsync({
            sourceTaskId: relatedTaskId,
            targetTaskId: taskId,
            type: 'related',
          });
          toast.success('Related task removed: Tasks are no longer linked');
          await invalidateCaches(relatedTaskId);
        } catch (e: any) {
          toast.error(
            `Failed to remove related task: ${e.message || 'Unable to remove related task'}`
          );
        }
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, invalidateCaches]
  );

  /**
   * Create a new task and link it as related
   */
  const createRelatedTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast.error('Cannot create task: Task must be saved first');
        return;
      }

      setSavingRelationship('create-related');
      try {
        const result = await createTaskWithRelationship.mutateAsync({
          name,
          listId,
          currentTaskId: taskId,
          relationshipType: 'related',
          currentTaskIsSource: true, // Direction doesn't matter for related
        });

        toast.success(`Related task created: "${name}" is now linked`);

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast.error(
          `Failed to create related task: ${e.message || 'Unable to create task'}`
        );
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, invalidateCaches]
  );

  // =========================================================================
  // Computed values (merge server data with pending for create mode)
  // =========================================================================

  const parentTask = isCreateMode
    ? pendingParent
    : (relationships?.parentTask ?? null);

  const childTasks = isCreateMode
    ? pendingChildren
    : (relationships?.childTasks ?? []);

  const blocking = isCreateMode
    ? pendingBlocking
    : (relationships?.blocking ?? []);

  const blockedBy = isCreateMode
    ? pendingBlockedBy
    : (relationships?.blockedBy ?? []);

  const relatedTasks = isCreateMode
    ? pendingRelated
    : (relationships?.relatedTasks ?? []);

  return {
    relationships,
    isLoading,
    parentTask,
    setParentTask,
    createParentTask,
    childTasks,
    addChildTask,
    removeChildTask,
    blocking,
    addBlockingTask,
    removeBlockingTask,
    createBlockingTask,
    blockedBy,
    addBlockedByTask,
    removeBlockedByTask,
    createBlockedByTask,
    relatedTasks,
    addRelatedTask,
    removeRelatedTask,
    createRelatedTask,
    savingRelationship,
  };
}
