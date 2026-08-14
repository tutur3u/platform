import type { Task } from '@tuturuuu/types/primitives/Task';
import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';
import type {
  PendingRelationship,
  PendingTaskRelationships,
} from '../types/pending-relationship';

type SelectedLabel = {
  id: string;
  name?: string;
  color?: string;
  created_at?: string;
};

type SelectedAssignee = {
  id: string;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type SelectedProject = { id: string; name?: string; status?: string };

export function getLegacyPendingTaskRelationships(
  parentTaskId?: string,
  pendingRelationship?: PendingRelationship
): PendingTaskRelationships {
  if (parentTaskId) {
    return {
      parentTask: {
        id: parentTaskId,
        name: pendingRelationship?.relatedTaskName || parentTaskId,
      },
      childTasks: [],
      blockingTasks: [],
      blockedByTasks: [],
      relatedTasks: [],
    };
  }

  if (!pendingRelationship?.relatedTaskId) {
    return {
      parentTask: null,
      childTasks: [],
      blockingTasks: [],
      blockedByTasks: [],
      relatedTasks: [],
    };
  }

  const relatedTask: RelatedTaskInfo = {
    id: pendingRelationship.relatedTaskId,
    name:
      pendingRelationship.relatedTaskName || pendingRelationship.relatedTaskId,
  };

  switch (pendingRelationship.type) {
    case 'subtask':
      return {
        parentTask: relatedTask,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
      };
    case 'parent':
      return {
        parentTask: null,
        childTasks: [relatedTask],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
      };
    case 'blocking':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [relatedTask],
        relatedTasks: [],
      };
    case 'blocked-by':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [relatedTask],
        blockedByTasks: [],
        relatedTasks: [],
      };
    case 'related':
      return {
        parentTask: null,
        childTasks: [],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [relatedTask],
      };
  }
}

export function withTaskCreateRelations(
  task: Partial<Task> & Pick<Task, 'list_id' | 'name'>,
  {
    pendingTaskRelationships,
    selectedAssignees,
    selectedLabels,
    selectedProjects,
  }: {
    pendingTaskRelationships: PendingTaskRelationships;
    selectedAssignees: SelectedAssignee[];
    selectedLabels: SelectedLabel[];
    selectedProjects: SelectedProject[];
  }
): Task {
  const labels: Task['labels'] = selectedLabels.flatMap((label) =>
    label.name && label.color && label.created_at
      ? [
          {
            id: label.id,
            name: label.name,
            color: label.color,
            created_at: label.created_at,
          },
        ]
      : []
  );
  const projects: Task['projects'] = selectedProjects.flatMap((project) =>
    project.name && project.status
      ? [
          {
            id: project.id,
            name: project.name,
            status: project.status,
          },
        ]
      : []
  );

  return {
    ...task,
    assignees: selectedAssignees.map((assignee) => ({
      id: assignee.user_id || assignee.id,
      display_name: assignee.display_name ?? undefined,
      avatar_url: assignee.avatar_url ?? undefined,
    })),
    labels,
    projects,
    relationship_summary: {
      parent_task_id: pendingTaskRelationships.parentTask?.id ?? null,
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
      child_count: pendingTaskRelationships.childTasks.length,
      completed_child_count: pendingTaskRelationships.childTasks.filter(
        (childTask) => childTask.completed
      ).length,
      blocked_by_count: pendingTaskRelationships.blockedByTasks.length,
      blocking_count: pendingTaskRelationships.blockingTasks.length,
      related_count: pendingTaskRelationships.relatedTasks.length,
    },
  } as Task;
}
