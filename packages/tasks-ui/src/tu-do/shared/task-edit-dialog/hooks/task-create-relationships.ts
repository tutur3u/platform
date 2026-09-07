import type { QueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTaskRelationship,
  deleteWorkspaceTaskRelationship,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import type { PendingTaskRelationships } from '../types/pending-relationship';

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

export interface TaskCreateRelationshipEdge {
  source_task_id: string;
  target_task_id: string;
  type: 'parent_child' | 'blocks' | 'related';
}

export async function persistPendingTaskRelationships(
  wsId: string,
  newTaskId: string,
  pending: PendingTaskRelationships,
  queryClient: QueryClient,
  progress?: {
    confirmed: TaskCreateRelationshipEdge[];
    save: (edges: TaskCreateRelationshipEdge[]) => void;
  }
) {
  const desired: TaskCreateRelationshipEdge[] = [];
  const add = (
    source_task_id: string,
    target_task_id: string,
    type: TaskCreateRelationshipEdge['type']
  ) => {
    desired.push({ source_task_id, target_task_id, type });
  };
  if (pending.parentTask?.id)
    add(pending.parentTask.id, newTaskId, 'parent_child');
  for (const task of dedupeById(pending.childTasks))
    add(newTaskId, task.id, 'parent_child');
  for (const task of dedupeById(pending.blockingTasks))
    add(newTaskId, task.id, 'blocks');
  for (const task of dedupeById(pending.blockedByTasks))
    add(task.id, newTaskId, 'blocks');
  for (const task of dedupeById(pending.relatedTasks))
    add(task.id, newTaskId, 'related');
  const key = (edge: TaskCreateRelationshipEdge) =>
    `${edge.source_task_id}:${edge.target_task_id}:${edge.type}`;
  const wanted = new Set(desired.map(key));
  const confirmed = new Map(
    (progress?.confirmed ?? []).map((edge) => [key(edge), edge])
  );
  const affectedTaskIds = new Set<string>([newTaskId]);
  const record = (edge: TaskCreateRelationshipEdge) => {
    affectedTaskIds.add(edge.source_task_id);
    affectedTaskIds.add(edge.target_task_id);
    progress?.save([...confirmed.values()]);
  };
  try {
    // A retry may include edits to the draft's previously confirmed relationships.
    for (const [edgeKey, edge] of confirmed) {
      if (wanted.has(edgeKey)) continue;
      await deleteWorkspaceTaskRelationship(wsId, edge.source_task_id, edge);
      confirmed.delete(edgeKey);
      record(edge);
    }
    for (const edge of desired) {
      if (!confirmed.has(key(edge))) {
        await createWorkspaceTaskRelationship(wsId, edge.source_task_id, edge);
        confirmed.set(key(edge), edge);
        record(edge);
      }
      affectedTaskIds.add(edge.source_task_id);
      affectedTaskIds.add(edge.target_task_id);
    }
  } finally {
    await Promise.all(
      [...affectedTaskIds].map((taskId) =>
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', taskId],
        })
      )
    );
  }
  return [...affectedTaskIds];
}
