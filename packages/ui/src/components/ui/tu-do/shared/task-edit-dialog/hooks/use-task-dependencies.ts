'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
} from '@tuturuuu/types/primitives/TaskRelationship';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import {
  useCreateTaskRelationship,
  useCreateTaskWithRelationship,
  useDeleteTaskRelationship,
  useTaskRelationships,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';

export interface UseTaskDependenciesProps {
  taskId?: string;
  boardId: string;
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
  listId,
  isCreateMode,
  onUpdate,
}: UseTaskDependenciesProps): UseTaskDependenciesReturn {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
  const createTaskWithRelationship = useCreateTaskWithRelationship(boardId);

  // Helper to invalidate caches
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
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] }),
      ]);
      onUpdate?.();
    },
    [taskId, boardId, queryClient, onUpdate]
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
          toast({
            title: 'Parent set',
            description: `This task is now a sub-task of "${task.name}"`,
          });
        } else {
          toast({
            title: 'Parent removed',
            description: 'This task is no longer a sub-task',
          });
        }

        await invalidateCaches(task?.id);
      } catch (e: any) {
        toast({
          title: 'Failed to update parent',
          description: e.message || 'Unable to update parent task',
          variant: 'destructive',
        });
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
      toast,
      invalidateCaches,
    ]
  );

  /**
   * Create a new task and set it as the parent of the current task
   */
  const createParentTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast({
          title: 'Cannot create parent task',
          description: 'Task must be saved first',
          variant: 'destructive',
        });
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

        toast({
          title: 'Parent task created',
          description: `"${name}" is now the parent of this task`,
        });

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to create parent task',
          description: e.message || 'Unable to create parent task',
          variant: 'destructive',
        });
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
      toast,
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
        toast({
          title: 'Sub-task added',
          description: `"${task.name}" is now a sub-task`,
        });
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to add sub-task',
          description: e.message || 'Unable to add sub-task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Sub-task removed',
          description: 'Task is no longer a sub-task',
        });
        await invalidateCaches(childTaskId);
      } catch (e: any) {
        toast({
          title: 'Failed to remove sub-task',
          description: e.message || 'Unable to remove sub-task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Blocking relationship added',
          description: `This task now blocks "${task.name}"`,
        });
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to add blocking relationship',
          description: e.message || 'Unable to add blocking relationship',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Blocking relationship removed',
          description: 'Task is no longer blocked by this task',
        });
        await invalidateCaches(blockedTaskId);
      } catch (e: any) {
        toast({
          title: 'Failed to remove blocking relationship',
          description: e.message || 'Unable to remove blocking relationship',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, toast, invalidateCaches]
  );

  /**
   * Create a new task that this task blocks
   */
  const createBlockingTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast({
          title: 'Cannot create task',
          description: 'Task must be saved first',
          variant: 'destructive',
        });
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

        toast({
          title: 'Blocking task created',
          description: `This task now blocks "${name}"`,
        });

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to create blocking task',
          description: e.message || 'Unable to create task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Dependency added',
          description: `This task is now blocked by "${task.name}"`,
        });
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to add dependency',
          description: e.message || 'Unable to add dependency',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Dependency removed',
          description: 'This task is no longer blocked',
        });
        await invalidateCaches(blockingTaskId);
      } catch (e: any) {
        toast({
          title: 'Failed to remove dependency',
          description: e.message || 'Unable to remove dependency',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, toast, invalidateCaches]
  );

  /**
   * Create a new task that blocks this task
   */
  const createBlockedByTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast({
          title: 'Cannot create task',
          description: 'Task must be saved first',
          variant: 'destructive',
        });
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

        toast({
          title: 'Blocking task created',
          description: `This task is now blocked by "${name}"`,
        });

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to create blocking task',
          description: e.message || 'Unable to create task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, toast, invalidateCaches]
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
        toast({
          title: 'Related task added',
          description: `"${task.name}" is now linked`,
        });
        await invalidateCaches(task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to add related task',
          description: e.message || 'Unable to add related task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, createRelationship, toast, invalidateCaches]
  );

  const removeRelatedTask = useCallback(
    async (relatedTaskId: string) => {
      if (isCreateMode) {
        setPendingRelated((prev) =>
          prev.filter((t) => t.id !== relatedTaskId)
        );
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
        toast({
          title: 'Related task removed',
          description: 'Tasks are no longer linked',
        });
        await invalidateCaches(relatedTaskId);
      } catch {
        // If first direction fails, try the other
        try {
          await deleteRelationship.mutateAsync({
            sourceTaskId: relatedTaskId,
            targetTaskId: taskId,
            type: 'related',
          });
          toast({
            title: 'Related task removed',
            description: 'Tasks are no longer linked',
          });
          await invalidateCaches(relatedTaskId);
        } catch (e: any) {
          toast({
            title: 'Failed to remove related task',
            description: e.message || 'Unable to remove related task',
            variant: 'destructive',
          });
        }
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, deleteRelationship, toast, invalidateCaches]
  );

  /**
   * Create a new task and link it as related
   */
  const createRelatedTask = useCallback(
    async (name: string) => {
      if (isCreateMode || !taskId || !listId) {
        toast({
          title: 'Cannot create task',
          description: 'Task must be saved first',
          variant: 'destructive',
        });
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

        toast({
          title: 'Related task created',
          description: `"${name}" is now linked`,
        });

        await invalidateCaches(result.task.id);
      } catch (e: any) {
        toast({
          title: 'Failed to create related task',
          description: e.message || 'Unable to create task',
          variant: 'destructive',
        });
      } finally {
        setSavingRelationship(null);
      }
    },
    [isCreateMode, taskId, listId, createTaskWithRelationship, toast, invalidateCaches]
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
