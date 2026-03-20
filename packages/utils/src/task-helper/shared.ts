import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

export function getTicketIdentifier(
  prefix: string | null | undefined,
  displayNumber: number
): string {
  const effectivePrefix = prefix?.trim() || 'TASK';
  return `${effectivePrefix}-${displayNumber}`.toUpperCase();
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
