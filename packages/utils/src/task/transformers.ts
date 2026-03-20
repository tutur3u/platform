import type { Task, TaskAssignee } from '@tuturuuu/types/primitives/Task';
import type { User } from '@tuturuuu/types/primitives/User';

type TaskUser = NonNullable<Task['assignees']>[number];
type TaskLabel = NonNullable<Task['labels']>[number];
type TaskProject = NonNullable<Task['projects']>[number];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTaskUser(
  assignee: (TaskAssignee & { user: User }) | TaskUser | null | undefined
): (TaskUser & { user_id: string }) | null {
  if (!assignee) {
    return null;
  }

  const expandedUser =
    'user' in assignee && assignee.user && typeof assignee.user === 'object'
      ? assignee.user
      : null;

  const effectiveUserId =
    expandedUser?.id ??
    ('user_id' in assignee && typeof assignee.user_id === 'string'
      ? assignee.user_id
      : undefined) ??
    ('id' in assignee && typeof assignee.id === 'string'
      ? assignee.id
      : undefined);

  if (!effectiveUserId) {
    return null;
  }

  const displayName =
    expandedUser?.display_name ??
    ('display_name' in assignee && typeof assignee.display_name === 'string'
      ? assignee.display_name
      : undefined);
  const email =
    expandedUser?.email ??
    ('email' in assignee && typeof assignee.email === 'string'
      ? assignee.email
      : undefined);
  const avatarUrl =
    expandedUser?.avatar_url ??
    ('avatar_url' in assignee && typeof assignee.avatar_url === 'string'
      ? assignee.avatar_url
      : undefined);
  const handle =
    expandedUser?.handle ??
    ('handle' in assignee && typeof assignee.handle === 'string'
      ? assignee.handle
      : undefined);

  return {
    id: effectiveUserId,
    ...(displayName ? { display_name: displayName } : {}),
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    ...(handle ? { handle } : {}),
    user_id: effectiveUserId,
  };
}

export function transformAssignees(
  assignees:
    | Array<(TaskAssignee & { user: User }) | TaskUser>
    | null
    | undefined
): (TaskUser & { user_id: string })[] {
  return (
    assignees
      ?.map((assignee) => normalizeTaskUser(assignee))
      .filter((user): user is TaskUser & { user_id: string } =>
        Boolean(user?.id)
      )
      .filter(
        (user, index: number, self) =>
          self.findIndex((u) => u.id === user.id) === index
      ) || []
  );
}

function normalizeLabels(labels: unknown): TaskLabel[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((entry): TaskLabel | null => {
      if (!isObject(entry)) {
        return null;
      }

      if ('label' in entry && isObject(entry.label) && 'id' in entry.label) {
        return entry.label as TaskLabel;
      }

      if ('id' in entry) {
        return entry as TaskLabel;
      }

      return null;
    })
    .filter((label): label is TaskLabel => Boolean(label?.id));
}

function normalizeProjects(projects: unknown): TaskProject[] {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map((entry): TaskProject | null => {
      if (!isObject(entry)) {
        return null;
      }

      if (
        'project' in entry &&
        isObject(entry.project) &&
        'id' in entry.project
      ) {
        return entry.project as TaskProject;
      }

      if ('id' in entry) {
        return entry as TaskProject;
      }

      return null;
    })
    .filter((project): project is TaskProject => Boolean(project?.id));
}

export function transformTaskRecord(task: any): Task {
  const normalizedLabels = normalizeLabels(task.labels);
  const normalizedProjects = normalizeProjects(task.projects);

  return {
    ...task,
    assignees: transformAssignees(task.assignees),
    labels: normalizedLabels,
    projects: normalizedProjects,
  } as Task;
}
