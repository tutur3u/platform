import type { QueryClient } from '@tanstack/react-query';
import { createWorkspaceTaskRelationship } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import type { PendingTaskRelationships } from '../types/pending-relationship';

const internalApiBaseUrl =
  typeof window !== 'undefined' ? window.location.origin : undefined;

export function dedupeById(tasks: RelatedTaskInfo[]): RelatedTaskInfo[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (!task.id || seen.has(task.id)) {
      return false;
    }
    seen.add(task.id);
    return true;
  });
}

export function applyPendingRelationshipSummary({
  boardId,
  newTaskId,
  queryClient,
  pendingTaskRelationships,
}: {
  boardId: string;
  newTaskId: string;
  queryClient: QueryClient;
  pendingTaskRelationships: PendingTaskRelationships;
}) {
  queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
    if (!old) return old;

    const parentTaskId = pendingTaskRelationships.parentTask?.id ?? null;
    const newTaskSummary = old.find((task) => task.id === newTaskId);
    const childTasks = dedupeById(pendingTaskRelationships.childTasks);
    const blockingTasks = dedupeById(pendingTaskRelationships.blockingTasks);
    const blockedByTasks = dedupeById(pendingTaskRelationships.blockedByTasks);
    const relatedTasks = dedupeById(pendingTaskRelationships.relatedTasks);

    return old.map((task) => {
      const relationshipSummary = task.relationship_summary ?? {
        parent_task_id: null,
        parent_task: null,
        child_count: 0,
        completed_child_count: 0,
        blocked_by_count: 0,
        blocking_count: 0,
        related_count: 0,
      };

      if (task.id === newTaskId) {
        return {
          ...task,
          relationship_summary: {
            parent_task_id: parentTaskId,
            parent_task: pendingTaskRelationships.parentTask
              ? {
                  id: pendingTaskRelationships.parentTask.id,
                  name: pendingTaskRelationships.parentTask.name,
                  display_number:
                    pendingTaskRelationships.parentTask.display_number ?? null,
                  ticket_prefix:
                    pendingTaskRelationships.parentTask.ticket_prefix ?? null,
                }
              : null,
            child_count: childTasks.length,
            completed_child_count: childTasks.filter(
              (childTask) => childTask.completed
            ).length,
            blocked_by_count: blockedByTasks.length,
            blocking_count: blockingTasks.length,
            related_count: relatedTasks.length,
          },
        };
      }

      if (parentTaskId && task.id === parentTaskId) {
        return {
          ...task,
          relationship_summary: {
            ...relationshipSummary,
            child_count: relationshipSummary.child_count + 1,
            completed_child_count:
              relationshipSummary.completed_child_count ?? 0,
          },
        };
      }

      if (childTasks.some((childTask) => childTask.id === task.id)) {
        return {
          ...task,
          relationship_summary: {
            ...relationshipSummary,
            parent_task_id: newTaskId,
            parent_task: {
              id: newTaskId,
              name: newTaskSummary?.name ?? '',
              display_number: newTaskSummary?.display_number ?? null,
              ticket_prefix: null,
            },
          },
        };
      }

      if (blockingTasks.some((blockingTask) => blockingTask.id === task.id)) {
        return {
          ...task,
          relationship_summary: {
            ...relationshipSummary,
            blocked_by_count: relationshipSummary.blocked_by_count + 1,
          },
        };
      }

      if (
        blockedByTasks.some((blockedByTask) => blockedByTask.id === task.id)
      ) {
        return {
          ...task,
          relationship_summary: {
            ...relationshipSummary,
            blocking_count: relationshipSummary.blocking_count + 1,
          },
        };
      }

      if (relatedTasks.some((relatedTask) => relatedTask.id === task.id)) {
        return {
          ...task,
          relationship_summary: {
            ...relationshipSummary,
            related_count: relationshipSummary.related_count + 1,
          },
        };
      }

      return task;
    });
  });
}

export async function persistPendingTaskRelationships(
  wsId: string,
  newTaskId: string,
  pendingTaskRelationships: PendingTaskRelationships,
  queryClient: QueryClient
) {
  const affectedTaskIds = new Set<string>([newTaskId]);

  const createRelationship = async ({
    sourceTaskId,
    targetTaskId,
    type,
  }: {
    sourceTaskId: string;
    targetTaskId: string;
    type: 'parent_child' | 'blocks' | 'related';
  }) => {
    await createWorkspaceTaskRelationship(
      wsId,
      sourceTaskId,
      {
        source_task_id: sourceTaskId,
        target_task_id: targetTaskId,
        type,
      },
      internalApiBaseUrl ? { baseUrl: internalApiBaseUrl } : undefined
    );
    affectedTaskIds.add(sourceTaskId);
    affectedTaskIds.add(targetTaskId);
  };

  try {
    if (pendingTaskRelationships.parentTask?.id) {
      await createRelationship({
        sourceTaskId: pendingTaskRelationships.parentTask.id,
        targetTaskId: newTaskId,
        type: 'parent_child',
      });
    }

    for (const childTask of dedupeById(pendingTaskRelationships.childTasks)) {
      await createRelationship({
        sourceTaskId: newTaskId,
        targetTaskId: childTask.id,
        type: 'parent_child',
      });
    }

    for (const blockingTask of dedupeById(
      pendingTaskRelationships.blockingTasks
    )) {
      await createRelationship({
        sourceTaskId: newTaskId,
        targetTaskId: blockingTask.id,
        type: 'blocks',
      });
    }

    for (const blockedByTask of dedupeById(
      pendingTaskRelationships.blockedByTasks
    )) {
      await createRelationship({
        sourceTaskId: blockedByTask.id,
        targetTaskId: newTaskId,
        type: 'blocks',
      });
    }

    for (const relatedTask of dedupeById(
      pendingTaskRelationships.relatedTasks
    )) {
      await createRelationship({
        sourceTaskId: relatedTask.id,
        targetTaskId: newTaskId,
        type: 'related',
      });
    }
  } catch (relationshipError) {
    console.error(
      'Failed to create pending task relationships:',
      relationshipError
    );
  }

  await Promise.all(
    Array.from(affectedTaskIds).map((taskId) =>
      queryClient.invalidateQueries({
        queryKey: ['task-relationships', taskId],
      })
    )
  );

  return Array.from(affectedTaskIds);
}
