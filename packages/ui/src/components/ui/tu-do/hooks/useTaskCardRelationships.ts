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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship]
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
        onSettled: () => setSavingTaskId(null),
      }
    );
  }, [taskId, parentTask, deleteRelationship]);

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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship]
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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, deleteRelationship]
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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship]
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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, deleteRelationship]
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
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, createRelationship]
  );

  const removeRelatedTask = useCallback(
    (targetTaskId: string) => {
      setSavingTaskId(targetTaskId);
      deleteRelationship.mutate(
        {
          sourceTaskId: taskId,
          targetTaskId: targetTaskId,
          type: 'related',
        },
        {
          onSettled: () => setSavingTaskId(null),
        }
      );
    },
    [taskId, deleteRelationship]
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
