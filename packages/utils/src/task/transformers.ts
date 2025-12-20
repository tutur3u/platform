import type { Task, TaskAssignee } from '@tuturuuu/types/primitives/Task';
import type { User } from '@tuturuuu/types/primitives/User';

export function transformAssignees(
  assignees: (TaskAssignee & { user: User })[]
): (User & { user_id: string })[] {
  return (
    assignees
      ?.map((a) => ({
        ...a.user,
        user_id: a.user?.id || '', // Include user_id for consistency with workspace members structure
      }))
      .filter(
        (user, index: number, self) =>
          user?.id && self.findIndex((u) => u.id === user.id) === index
      ) || []
  );
}

type TaskLabelEntry = {
  label?: NonNullable<Task['labels']>[number] | null;
};

type TaskProjectEntry = {
  project?: NonNullable<Task['projects']>[number] | null;
};

export function transformTaskRecord(task: any): Task {
  const normalizedLabels =
    (task.labels as TaskLabelEntry[] | null | undefined)
      ?.map((entry) => entry.label)
      .filter((label): label is NonNullable<Task['labels']>[number] =>
        Boolean(label)
      ) ?? [];

  const normalizedProjects =
    (task.projects as TaskProjectEntry[] | null | undefined)
      ?.map((entry) => entry.project)
      .filter((project): project is NonNullable<Task['projects']>[number] =>
        Boolean(project)
      ) ?? [];

  return {
    ...task,
    assignees: transformAssignees(
      task.assignees as (TaskAssignee & { user: User })[]
    ),
    labels: normalizedLabels,
    projects: normalizedProjects,
  } as Task;
}
