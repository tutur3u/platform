'use client';

import type {
  RelatedTaskInfo,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';
import {
  useCreateTaskRelationship,
  useDeleteTaskRelationship,
  useTaskRelationships,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';
import { useBoardBroadcast } from '../shared/board-broadcast-context';

export interface UseTaskCardRelationshipsProps {
  taskId: string;
  boardId: string;
}

export interface UseTaskCardRelationshipsReturn {
  // Data
  parentTask: RelatedTaskInfo | null;
  childTasks: RelatedTaskInfo[];
  blocking: RelatedTaskInfo[];
  blockedBy: RelatedTaskInfo[];
  relatedTasks: RelatedTaskInfo[];
  isLoading: boolean;

  // Actions for parent
  setParentTask: (task: RelatedTaskInfo) => void;
  removeParentTask: () => void;

  // Actions for blocking
  addBlockingTask: (task: RelatedTaskInfo) => void;
  removeBlockingTask: (taskId: string) => void;
  addBlockedByTask: (task: RelatedTaskInfo) => void;
  removeBlockedByTask: (taskId: string) => void;

  // Actions for related
  addRelatedTask: (task: RelatedTaskInfo) => void;
  removeRelatedTask: (taskId: string) => void;

  // Saving state
  isSaving: boolean;
  savingTaskId: string | null;
}

/**
 * Hook for managing task relationships in the kanban task card context.
 * This is a lightweight version for the dropdown menu use case.
 */
export function useTaskCardRelationships({
  taskId,
  boardId,
}: UseTaskCardRelationshipsProps): UseTaskCardRelationshipsReturn {
  const broadcast = useBoardBroadcast();
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  // Fetch relationships
  const { data: relationships, isLoading } = useTaskRelationships(taskId);

  // Mutations
  const createRelationship = useCreateTaskRelationship(boardId);
  const deleteRelationship = useDeleteTaskRelationship(boardId);

  const isSaving = createRelationship.isPending || deleteRelationship.isPending;

  // Extract relationship data
  const parentTask = relationships?.parentTask ?? null;
  const childTasks = relationships?.childTasks ?? [];
  const blocking = relationships?.blocking ?? [];
  const blockedBy = relationships?.blockedBy ?? [];
  const relatedTasks = relationships?.relatedTasks ?? [];

  // Parent task actions
  const setParentTask = useCallback(
    (task: RelatedTaskInfo) => {
      setSavingTaskId(task.id);
      createRelationship.mutate(
        {
          source_task_id: task.id,
          target_task_id: taskId,
          type: 'parent_child' as TaskRelationshipType,
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', { taskIds: [task.id, taskId] });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship, broadcast]
  );

  const removeParentTask = useCallback(() => {
    if (!parentTask) return;
    setSavingTaskId(parentTask.id);
    deleteRelationship.mutate(
      {
        sourceTaskId: parentTask.id,
        targetTaskId: taskId,
        type: 'parent_child',
      },
      {
        onSuccess: () => {
          broadcast?.('task:deps-changed', {
            taskIds: [parentTask.id, taskId],
          });
        },
        onSettled: () => setSavingTaskId(null),
      }
    );
  }, [taskId, parentTask, deleteRelationship, broadcast]);

  // Blocking task actions (this task blocks another)
  const addBlockingTask = useCallback(
    (task: RelatedTaskInfo) => {
      setSavingTaskId(task.id);
      createRelationship.mutate(
        {
          source_task_id: taskId,
          target_task_id: task.id,
          type: 'blocks' as TaskRelationshipType,
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', { taskIds: [taskId, task.id] });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship, broadcast]
  );

  const removeBlockingTask = useCallback(
    (targetTaskId: string) => {
      setSavingTaskId(targetTaskId);
      deleteRelationship.mutate(
        {
          sourceTaskId: taskId,
          targetTaskId: targetTaskId,
          type: 'blocks',
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', {
              taskIds: [taskId, targetTaskId],
            });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, deleteRelationship, broadcast]
  );

  // Blocked by task actions (another task blocks this)
  const addBlockedByTask = useCallback(
    (task: RelatedTaskInfo) => {
      setSavingTaskId(task.id);
      createRelationship.mutate(
        {
          source_task_id: task.id,
          target_task_id: taskId,
          type: 'blocks' as TaskRelationshipType,
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', { taskIds: [task.id, taskId] });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship, broadcast]
  );

  const removeBlockedByTask = useCallback(
    (sourceTaskId: string) => {
      setSavingTaskId(sourceTaskId);
      deleteRelationship.mutate(
        {
          sourceTaskId: sourceTaskId,
          targetTaskId: taskId,
          type: 'blocks',
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', {
              taskIds: [sourceTaskId, taskId],
            });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, deleteRelationship, broadcast]
  );

  // Related task actions
  const addRelatedTask = useCallback(
    (task: RelatedTaskInfo) => {
      setSavingTaskId(task.id);
      createRelationship.mutate(
        {
          source_task_id: taskId,
          target_task_id: task.id,
          type: 'related' as TaskRelationshipType,
        },
        {
          onSuccess: () => {
            broadcast?.('task:deps-changed', { taskIds: [taskId, task.id] });
          },
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship, broadcast]
  );

  const removeRelatedTask = useCallback(
    (targetTaskId: string) => {
      setSavingTaskId(targetTaskId);
      const broadcastDeps = () => {
        broadcast?.('task:deps-changed', { taskIds: [taskId, targetTaskId] });
      };
      // Try the first direction (taskId -> targetTaskId)
      deleteRelationship.mutate(
        {
          sourceTaskId: taskId,
          targetTaskId: targetTaskId,
          type: 'related',
        },
        {
          onError: () => {
            // First direction failed, try the reverse direction (targetTaskId -> taskId)
            deleteRelationship.mutate(
              {
                sourceTaskId: targetTaskId,
                targetTaskId: taskId,
                type: 'related',
              },
              {
                onSuccess: broadcastDeps,
                onSettled: () => setSavingTaskId(null),
              }
            );
          },
          onSuccess: () => {
            broadcastDeps();
            setSavingTaskId(null);
          },
        }
      );
    },
    [taskId, deleteRelationship, broadcast]
  );

  return {
    parentTask,
    childTasks,
    blocking,
    blockedBy,
    relatedTasks,
    isLoading,
    setParentTask,
    removeParentTask,
    addBlockingTask,
    removeBlockingTask,
    addBlockedByTask,
    removeBlockedByTask,
    addRelatedTask,
    removeRelatedTask,
    isSaving,
    savingTaskId,
  };
}
