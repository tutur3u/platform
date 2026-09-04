import type {
  ListWorkspaceTasksOptions,
  WorkspaceTaskListCount,
} from '@tuturuuu/internal-api/tasks';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  getTaskIdentifierForSearch,
  isTicketIdentifierLikeQuery,
} from '@tuturuuu/utils/task-helper';

/**
 * Identifier lookups are exact matches scoped to a single board, so they only
 * ever return a handful of rows. Keeping this well below the name-search limit
 * bounds the size of the merged result set.
 */
export const TICKET_IDENTIFIER_SEARCH_LIMIT = 50;

/**
 * Returns the trimmed query when it can be read as a ticket identifier
 * (`115` or `DEV-115`), otherwise null.
 */
export function getTicketIdentifierSearchQuery(
  searchQuery: string | null | undefined
): string | null {
  const trimmed = searchQuery?.trim();
  if (!trimmed) return null;
  return isTicketIdentifierLikeQuery(trimmed) ? trimmed : null;
}

/**
 * Composed ticket identifier for a task, matching what the task card renders:
 * a task-level prefix wins, the board prefix is the fallback. Returns null when
 * the task has no display number, so callers never build `DEV-null`.
 */
export function getBoardTaskIdentifier(
  task: Task,
  boardTicketPrefix?: string | null
): string | null {
  const taskTicketPrefix = (task as Task & { ticket_prefix?: string | null })
    .ticket_prefix;

  return getTaskIdentifierForSearch({
    ticket_prefix: taskTicketPrefix ?? boardTicketPrefix ?? null,
    display_number: task.display_number,
  });
}

/** Returns whether a task matches the board's local free-text search. */
export function taskMatchesBoardSearch(
  task: Task,
  searchQuery: string | null | undefined,
  boardTicketPrefix?: string | null
): boolean {
  const query = searchQuery?.trim().toLowerCase();
  if (!query) return true;

  return [
    task.name,
    typeof task.display_number === 'number'
      ? String(task.display_number)
      : null,
    getBoardTaskIdentifier(task, boardTicketPrefix),
    ...(task.labels ?? []).map((label) => label.name),
    ...(task.projects ?? []).map((project) => project.name),
    ...(task.assignees ?? []).flatMap((assignee) => [
      assignee.display_name,
      assignee.email,
      assignee.handle,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Splits a task query into its name leg and, when the search text looks like a
 * ticket identifier, an identifier leg. The API ands `q` with `identifier`, so
 * matching either one requires two requests.
 */
export function buildTaskSearchQueryVariants(base: ListWorkspaceTasksOptions): {
  nameQuery: ListWorkspaceTasksOptions;
  identifierQuery: ListWorkspaceTasksOptions | null;
} {
  const identifier = getTicketIdentifierSearchQuery(base.q);

  return {
    nameQuery: base,
    identifierQuery: identifier ? { ...base, q: undefined, identifier } : null,
  };
}

/** Merges two task lists by id, keeping the first occurrence and its order. */
export function mergeTasksById<T extends { id: string }>(
  primary: T[],
  secondary: T[]
): T[] {
  const merged = new Map<string, T>();

  for (const task of primary) {
    merged.set(task.id, task);
  }

  for (const task of secondary) {
    if (!merged.has(task.id)) {
      merged.set(task.id, task);
    }
  }

  return [...merged.values()];
}

/**
 * Merges per-list counts from both search legs. A task can match by name and by
 * identifier at once, so the counts are combined with max rather than summed.
 * Callers only compare these against zero to decide whether a list is visible.
 */
export function mergeListCountsByListId(
  nameCounts: WorkspaceTaskListCount[],
  identifierCounts: WorkspaceTaskListCount[]
): WorkspaceTaskListCount[] {
  const merged = new Map<string, number>();

  for (const entry of [...nameCounts, ...identifierCounts]) {
    merged.set(
      entry.list_id,
      Math.max(merged.get(entry.list_id) ?? 0, entry.count)
    );
  }

  return [...merged.entries()].map(([list_id, count]) => ({ list_id, count }));
}

/** Loads and merges the name and exact-identifier task-search legs. */
export async function listBoardTasksForSearch(
  workspaceId: string,
  options: ListWorkspaceTasksOptions
): Promise<Task[]> {
  const { nameQuery, identifierQuery } = buildTaskSearchQueryVariants(options);
  if (!identifierQuery) {
    return (await listWorkspaceTasks(workspaceId, nameQuery)).tasks;
  }

  const [nameResult, identifierResult] = await Promise.all([
    listWorkspaceTasks(workspaceId, nameQuery),
    listWorkspaceTasks(workspaceId, {
      ...identifierQuery,
      limit: TICKET_IDENTIFIER_SEARCH_LIMIT,
    }),
  ]);

  return mergeTasksById(identifierResult.tasks, nameResult.tasks);
}

/** Loads list visibility counts across both task-search legs. */
export async function listBoardTaskCountsForSearch(
  workspaceId: string,
  options: ListWorkspaceTasksOptions
): Promise<WorkspaceTaskListCount[]> {
  const { nameQuery, identifierQuery } = buildTaskSearchQueryVariants(options);
  if (!identifierQuery) {
    return (await listWorkspaceTasks(workspaceId, nameQuery)).listCounts ?? [];
  }

  const [nameResult, identifierResult] = await Promise.all([
    listWorkspaceTasks(workspaceId, nameQuery),
    listWorkspaceTasks(workspaceId, identifierQuery),
  ]);

  return mergeListCountsByListId(
    nameResult.listCounts ?? [],
    identifierResult.listCounts ?? []
  );
}
