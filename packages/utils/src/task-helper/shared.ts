import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

export function getTicketIdentifier(
  prefix: string | null | undefined,
  displayNumber: number | null | undefined
): string {
  const effectivePrefix = prefix?.trim() || 'TASK';
  if (typeof displayNumber !== 'number' || !Number.isFinite(displayNumber)) {
    return effectivePrefix.toUpperCase();
  }
  return `${effectivePrefix}-${displayNumber}`.toUpperCase();
}

/** Project links are ordered by first join, then project id for timestamp ties. */
export function getTaskTicketLabel(task: {
  projects?: Task['projects'] | null;
  ticket_projects?: Task['projects'] | null;
}): string | null {
  const first = [...(task.ticket_projects ?? task.projects ?? [])].sort(
    (a, b) => {
      const time = (value?: string | null) => {
        const parsed = value ? Date.parse(value) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };
      return (
        time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id)
      );
    }
  )[0];
  if (
    !first?.ticket_key ||
    !/^[A-Z][A-Z0-9]{1,9}$/.test(first.ticket_key) ||
    !Number.isSafeInteger(first.ticket_number) ||
    (first.ticket_number ?? 0) < 1
  )
    return null;
  return `${first.ticket_key}-${first.ticket_number}`;
}

export function normalizeTaskSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export function isTicketIdentifierLikeQuery(query: string) {
  const normalized = normalizeTaskSearchValue(query);
  if (!normalized) return false;
  return /^\d+$/.test(normalized) || /^[a-z][a-z0-9_-]*-\d+$/.test(normalized);
}

export function getTaskIdentifierForSearch(task: {
  ticket_prefix?: string | null;
  display_number?: number | null;
}) {
  if (typeof task.display_number !== 'number') {
    return null;
  }

  return getTicketIdentifier(task.ticket_prefix, task.display_number);
}

export async function getMutationApiOptions(): Promise<
  InternalApiClientOptions | undefined
> {
  if (typeof window !== 'undefined') {
    return { baseUrl: window.location.origin };
  }

  return undefined;
}

export function getBrowserApiOptions(): InternalApiClientOptions | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return { baseUrl: window.location.origin };
}

export async function listAllActiveTasksForList(wsId: string, listId: string) {
  const tasks: Task[] = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    const { tasks: page } = await listWorkspaceTasks(
      wsId,
      {
        listId,
        limit: pageSize,
        offset,
        includeDeleted: false,
      },
      getBrowserApiOptions()
    );

    if (!page.length) {
      break;
    }

    tasks.push(...(page as Task[]));

    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return tasks;
}

export function toWorkspaceTaskUpdatePayload(
  task: Partial<Task> & { completed?: boolean }
) {
  return {
    ...(task.name !== undefined ? { name: task.name } : {}),
    ...(task.description !== undefined
      ? { description: task.description }
      : {}),
    ...(task.priority !== undefined ? { priority: task.priority } : {}),
    ...(task.start_date !== undefined ? { start_date: task.start_date } : {}),
    ...(task.end_date !== undefined ? { end_date: task.end_date } : {}),
    ...(task.closed_at !== undefined ? { closed_at: task.closed_at } : {}),
    ...(task.completed_at !== undefined
      ? { completed_at: task.completed_at }
      : {}),
    ...(task.list_id !== undefined ? { list_id: task.list_id } : {}),
    ...(task.estimation_points !== undefined
      ? { estimation_points: task.estimation_points }
      : {}),
    ...(task.completed !== undefined ? { completed: task.completed } : {}),
    ...(task.sort_key !== undefined && task.sort_key !== null
      ? { sort_key: task.sort_key }
      : {}),
  };
}
