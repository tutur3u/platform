'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkspaceTaskRelationships } from '@tuturuuu/internal-api/tasks';
import type {
  RelatedTaskInfo,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';
import {
  useCreateTaskRelationship,
  useDeleteTaskRelationship,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useState } from 'react';
import { useBoardBroadcast } from '../shared/board-broadcast-context';

export interface UseTaskCardRelationshipsProps {
  taskId: string;
  boardId: string;
  wsId?: string;
  enabled?: boolean;
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
  hasLoadedRelationships: boolean;
}

/**
 * Hook for managing task relationships in the kanban task card context.
 * This is a lightweight version for the dropdown menu use case.
 */
export function useTaskCardRelationships({
  taskId,
  boardId,
  wsId,
  enabled = true,
}: UseTaskCardRelationshipsProps): UseTaskCardRelationshipsReturn {
  const broadcast = useBoardBroadcast();
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  // Fetch relationships
  const { data: relationships, isLoading } = useQuery({
    queryKey: ['task-relationships', taskId, wsId ?? 'unknown'],
    queryFn: async () => {
      if (!wsId || !taskId) {
        return null;
      }

      return getWorkspaceTaskRelationships(wsId, taskId);
    },
    enabled: enabled && !!wsId && !!taskId,
    staleTime: 30000,
  });

  // Mutations
  const resolvedWsId = wsId ?? '';
  const createRelationship = useCreateTaskRelationship(resolvedWsId, boardId);
  const deleteRelationship = useDeleteTaskRelationship(resolvedWsId, boardId);

  const isSaving = createRelationship.isPending || deleteRelationship.isPending;

  // Extract relationship data
  const parentTask = relationships?.parentTask ?? null;
  const childTasks = relationships?.childTasks ?? [];
  const blocking = relationships?.blocking ?? [];
  const blockedBy = relationships?.blockedBy ?? [];
  const relatedTasks = relationships?.relatedTasks ?? [];
  const hasLoadedRelationships = relationships !== undefined;

  // Parent task actions
  const setParentTask = useCallback(
    (task: RelatedTaskInfo) => {
      if (!wsId) return;
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
    [taskId, createRelationship, broadcast, wsId]
  );

  const removeParentTask = useCallback(() => {
    if (!wsId) return;
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
  }, [taskId, parentTask, deleteRelationship, broadcast, wsId]);

  // Blocking task actions (this task blocks another)
  const addBlockingTask = useCallback(
    (task: RelatedTaskInfo) => {
      if (!wsId) return;
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
    [taskId, createRelationship, broadcast, wsId]
  );

  const removeBlockingTask = useCallback(
    (targetTaskId: string) => {
      if (!wsId) return;
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
    [taskId, deleteRelationship, broadcast, wsId]
  );

  // Blocked by task actions (another task blocks this)
  const addBlockedByTask = useCallback(
    (task: RelatedTaskInfo) => {
      if (!wsId) return;
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
    [taskId, createRelationship, broadcast, wsId]
  );

  const removeBlockedByTask = useCallback(
    (sourceTaskId: string) => {
      if (!wsId) return;
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
    [taskId, deleteRelationship, broadcast, wsId]
  );

  // Related task actions
  const addRelatedTask = useCallback(
    (task: RelatedTaskInfo) => {
      if (!wsId) return;
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
    [taskId, createRelationship, broadcast, wsId]
  );

  const removeRelatedTask = useCallback(
    (targetTaskId: string) => {
      if (!wsId) return;
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
    [taskId, deleteRelationship, broadcast, wsId]
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
    hasLoadedRelationships,
  };
}
