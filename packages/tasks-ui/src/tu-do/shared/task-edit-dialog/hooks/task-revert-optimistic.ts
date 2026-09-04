import type { RevertibleTaskHistoryField } from '@tuturuuu/internal-api/task-history';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskSnapshot } from '@tuturuuu/utils/task-snapshot';

type TaskWithCompletion = Task & { completed?: boolean | null };

function serializeDescription(description: TaskSnapshot['description']) {
  if (description == null || typeof description === 'string') {
    return description ?? undefined;
  }

  return JSON.stringify(description);
}

export function applyTaskHistorySnapshot({
  task,
  snapshot,
  fields,
  now,
}: {
  task: Task;
  snapshot: TaskSnapshot;
  fields: RevertibleTaskHistoryField[];
  now: string;
}): Task {
  const nextTask: TaskWithCompletion = { ...task };
  const selected = new Set(fields);

  if (selected.has('name')) nextTask.name = snapshot.name;
  if (selected.has('description')) {
    nextTask.description = serializeDescription(snapshot.description);
  }
  if (selected.has('priority')) nextTask.priority = snapshot.priority;
  if (selected.has('start_date')) {
    nextTask.start_date = snapshot.start_date ?? undefined;
  }
  if (selected.has('end_date')) nextTask.end_date = snapshot.end_date;
  if (selected.has('estimation_points')) {
    nextTask.estimation_points = snapshot.estimation_points;
  }
  if (selected.has('list_id')) nextTask.list_id = snapshot.list_id;
  if (selected.has('completed')) {
    nextTask.completed = snapshot.completed;
    nextTask.completed_at = snapshot.completed ? now : undefined;
  }

  if (selected.has('assignees')) {
    nextTask.assignees = snapshot.assignees.map((assignee) => ({
      id: assignee.user_id ?? assignee.id,
      display_name: assignee.display_name ?? undefined,
      avatar_url: assignee.avatar_url ?? undefined,
    }));
  }

  if (selected.has('labels')) {
    nextTask.labels = snapshot.labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color ?? 'gray',
      created_at:
        task.labels?.find((current) => current.id === label.id)?.created_at ??
        '',
    }));
  }

  if (selected.has('projects')) {
    nextTask.projects = snapshot.projects.map((project) => ({
      id: project.id,
      name: project.name,
      status:
        task.projects?.find((current) => current.id === project.id)?.status ??
        'active',
    }));
  }

  return nextTask;
}

export function restoreTaskHistoryFields({
  currentTask,
  previousTask,
  fields,
}: {
  currentTask: Task;
  previousTask: Task;
  fields: RevertibleTaskHistoryField[];
}): Task {
  const restored = { ...currentTask } as TaskWithCompletion;
  const previous = previousTask as TaskWithCompletion;
  const selected = new Set(fields);

  if (selected.has('name')) restored.name = previous.name;
  if (selected.has('description')) restored.description = previous.description;
  if (selected.has('priority')) restored.priority = previous.priority;
  if (selected.has('start_date')) restored.start_date = previous.start_date;
  if (selected.has('end_date')) restored.end_date = previous.end_date;
  if (selected.has('estimation_points')) {
    restored.estimation_points = previous.estimation_points;
  }
  if (selected.has('list_id')) restored.list_id = previous.list_id;
  if (selected.has('completed')) {
    restored.completed = previous.completed;
    restored.completed_at = previous.completed_at;
  }
  if (selected.has('assignees')) restored.assignees = previous.assignees;
  if (selected.has('labels')) restored.labels = previous.labels;
  if (selected.has('projects')) restored.projects = previous.projects;

  return restored;
}
