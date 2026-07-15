import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';

/**
 * Relationship types for creating tasks with relationships
 *
 * These types define how new tasks can be related to existing tasks during creation.
 * - subtask: New task will be a subtask of relatedTaskId
 * - parent: New task will be the parent of relatedTaskId
 * - blocking: New task will be blocked by relatedTaskId (relatedTask blocks newTask)
 * - blocked-by: New task will block relatedTaskId (newTask blocks relatedTask)
 * - related: New task will be related to relatedTaskId
 */
export type PendingRelationshipType =
  | 'subtask'
  | 'parent'
  | 'blocking'
  | 'blocked-by'
  | 'related';

/**
 * Pending relationship object containing type and related task information
 */
export interface PendingRelationship {
  type: PendingRelationshipType;
  relatedTaskId: string;
  relatedTaskName: string;
}

export interface PendingTaskRelationships {
  parentTask: RelatedTaskInfo | null;
  childTasks: RelatedTaskInfo[];
  blockingTasks: RelatedTaskInfo[];
  blockedByTasks: RelatedTaskInfo[];
  relatedTasks: RelatedTaskInfo[];
  initialActiveTab?: 'parent' | 'subtasks' | 'dependencies' | 'related';
  initialDependencySubTab?: 'blocks' | 'blocked-by';
}

function createSeedTaskInfo(
  id: string,
  name: string | null | undefined
): RelatedTaskInfo {
  return {
    id,
    name: name?.trim() || id,
  };
}

export function getSeededPendingTaskRelationships({
  parentTaskId,
  parentTaskName,
  pendingRelationship,
}: {
  parentTaskId?: string | null;
  parentTaskName?: string | null;
  pendingRelationship?: PendingRelationship | null;
}): PendingTaskRelationships {
  if (parentTaskId) {
    return {
      parentTask: createSeedTaskInfo(parentTaskId, parentTaskName),
      childTasks: [],
      blockingTasks: [],
      blockedByTasks: [],
      relatedTasks: [],
      initialActiveTab: 'parent',
    };
  }

  if (!pendingRelationship?.relatedTaskId) {
    return {
      parentTask: null,
      childTasks: [],
      blockingTasks: [],
      blockedByTasks: [],
      relatedTasks: [],
      initialActiveTab: 'parent',
    };
  }

  const relatedTask = createSeedTaskInfo(
    pendingRelationship.relatedTaskId,
    pendingRelationship.relatedTaskName
  );

  switch (pendingRelationship.type) {
    case 'subtask':
      return {
        parentTask: relatedTask,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
        initialActiveTab: 'parent',
      };
    case 'parent':
      return {
        parentTask: null,
        childTasks: [relatedTask],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
        initialActiveTab: 'subtasks',
      };
    case 'blocking':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [relatedTask],
        relatedTasks: [],
        initialActiveTab: 'dependencies',
        initialDependencySubTab: 'blocked-by',
      };
    case 'blocked-by':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [relatedTask],
        blockedByTasks: [],
        relatedTasks: [],
        initialActiveTab: 'dependencies',
        initialDependencySubTab: 'blocks',
      };
    case 'related':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [relatedTask],
        initialActiveTab: 'related',
      };
  }
}
