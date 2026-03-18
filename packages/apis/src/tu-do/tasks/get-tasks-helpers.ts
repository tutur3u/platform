import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import type {
  Database,
  TaskAssigneeRelationRow,
  TaskCounterpartLookupRow,
  TaskLabelRelationRow,
  TaskProjectRelationRow,
  TaskRouteRecordRow,
} from '@tuturuuu/types';

type TaskRelationshipEdge =
  Database['public']['Tables']['task_relationships']['Row'];

export type TaskAssigneeRelation = TaskAssigneeRelationRow;
export type TaskLabelRelation = TaskLabelRelationRow;
export type TaskProjectRelation = TaskProjectRelationRow;
type RelationshipCounterpartTask = TaskCounterpartLookupRow;
export type TaskRecord = TaskRouteRecordRow;

export interface TaskRelationshipSummary {
  parentTaskId: string | null;
  childCount: number;
  blockedByCount: number;
  blockingCount: number;
  relatedCount: number;
}

function createDefaultTaskRelationshipSummary(): TaskRelationshipSummary {
  return {
    parentTaskId: null,
    childCount: 0,
    blockedByCount: 0,
    blockingCount: 0,
    relatedCount: 0,
  };
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export function normalizeTask<T extends TaskRecord>(task: T) {
  const normalizedAssignees = (task.assignees ?? []).flatMap(
    (entry: TaskAssigneeRelation) => {
      const resolvedId = entry.user?.id || entry.user_id;
      if (!resolvedId) {
        return [];
      }

      return [
        {
          id: resolvedId,
          user_id: resolvedId,
          display_name: entry.user?.display_name ?? undefined,
          avatar_url: entry.user?.avatar_url ?? undefined,
        },
      ];
    }
  );

  const normalizedLabels = (task.labels ?? []).flatMap(
    (entry: TaskLabelRelation) => {
      if (!entry.label?.id) {
        return [];
      }

      return [
        {
          id: entry.label.id,
          name: entry.label.name ?? undefined,
          color: entry.label.color ?? undefined,
          created_at: entry.label.created_at ?? undefined,
        },
      ];
    }
  );

  const normalizedProjects = (task.projects ?? []).flatMap(
    (entry: TaskProjectRelation) => {
      if (!entry.project?.id) {
        return [];
      }

      return [
        {
          id: entry.project.id,
          name: entry.project.name ?? undefined,
          status: entry.project.status ?? undefined,
        },
      ];
    }
  );

  return {
    ...task,
    assignees: normalizedAssignees,
    labels: normalizedLabels,
    projects: normalizedProjects,
    assignee_ids: Array.from(
      new Set(normalizedAssignees.map((assignee) => assignee.id))
    ),
    label_ids: Array.from(new Set(normalizedLabels.map((label) => label.id))),
    project_ids: Array.from(
      new Set(normalizedProjects.map((project) => project.id))
    ),
    list_deleted: task.task_lists?.deleted ?? false,
  };
}

export async function buildTaskRelationshipSummary(
  sbAdmin: TypedSupabaseClient,
  workspaceId: string,
  taskIds: string[]
) {
  const relationshipSummaryByTaskId = new Map<string, TaskRelationshipSummary>(
    taskIds.map((taskId) => [taskId, createDefaultTaskRelationshipSummary()])
  );

  if (taskIds.length === 0) {
    return relationshipSummaryByTaskId;
  }

  const [sourceEdgesResult, targetEdgesResult] = await Promise.all([
    sbAdmin
      .from('task_relationships')
      .select('id, source_task_id, target_task_id, type')
      .in('source_task_id', taskIds),
    sbAdmin
      .from('task_relationships')
      .select('id, source_task_id, target_task_id, type')
      .in('target_task_id', taskIds),
  ]);

  const relationshipError = sourceEdgesResult.error ?? targetEdgesResult.error;
  if (relationshipError) {
    throw new Error('TASK_RELATIONSHIP_QUERY_FAILED');
  }

  const relationshipEdges = [
    ...(sourceEdgesResult.data ?? []),
    ...(targetEdgesResult.data ?? []),
  ] as TaskRelationshipEdge[];

  const counterpartTaskIds = Array.from(
    new Set(
      relationshipEdges
        .flatMap((edge) => [edge.source_task_id, edge.target_task_id])
        .filter((taskId): taskId is string => Boolean(taskId))
    )
  );

  const validCounterpartTaskIds = new Set<string>();
  const counterpartTaskIdChunks = chunkArray(counterpartTaskIds, 200);

  for (const counterpartTaskIdChunk of counterpartTaskIdChunks) {
    const { data: counterpartTasks, error: counterpartTasksError } =
      await sbAdmin
        .from('tasks')
        .select(
          `
          id,
          deleted_at,
          list:task_lists(
            board:workspace_boards(
              ws_id
            )
          )
        `
        )
        .in('id', counterpartTaskIdChunk);

    if (counterpartTasksError) {
      throw new Error('TASK_RELATIONSHIP_COUNTERPART_QUERY_FAILED');
    }

    for (const counterpartTask of counterpartTasks as RelationshipCounterpartTask[]) {
      if (
        counterpartTask.deleted_at === null &&
        counterpartTask.list?.board?.ws_id === workspaceId
      ) {
        validCounterpartTaskIds.add(counterpartTask.id);
      }
    }
  }

  const processedRelationshipEdgeKeys = new Set<string>();

  for (const edge of relationshipEdges) {
    const sourceId = edge.source_task_id;
    const targetId = edge.target_task_id;
    const type = edge.type;
    const edgeKey = edge.id ?? `${sourceId}:${targetId}:${type}`;

    if (processedRelationshipEdgeKeys.has(edgeKey)) {
      continue;
    }

    processedRelationshipEdgeKeys.add(edgeKey);

    if (!sourceId || !targetId || !type) {
      continue;
    }

    const sourceSummary = relationshipSummaryByTaskId.get(sourceId);
    const targetSummary = relationshipSummaryByTaskId.get(targetId);
    const sourceCounterpartValid = validCounterpartTaskIds.has(targetId);
    const targetCounterpartValid = validCounterpartTaskIds.has(sourceId);

    switch (type) {
      case 'parent_child': {
        if (sourceSummary && sourceCounterpartValid) {
          sourceSummary.childCount += 1;
        }
        if (
          targetSummary &&
          targetCounterpartValid &&
          !targetSummary.parentTaskId
        ) {
          targetSummary.parentTaskId = sourceId;
        }
        break;
      }
      case 'blocks': {
        if (sourceSummary && sourceCounterpartValid) {
          sourceSummary.blockingCount += 1;
        }
        if (targetSummary && targetCounterpartValid) {
          targetSummary.blockedByCount += 1;
        }
        break;
      }
      case 'related': {
        if (sourceSummary && sourceCounterpartValid) {
          sourceSummary.relatedCount += 1;
        }
        if (targetSummary && targetCounterpartValid) {
          targetSummary.relatedCount += 1;
        }
        break;
      }
    }
  }

  return relationshipSummaryByTaskId;
}
