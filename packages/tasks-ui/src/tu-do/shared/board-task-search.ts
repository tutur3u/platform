import type {
  ListWorkspaceTasksOptions,
  WorkspaceTaskListCount,
} from '@tuturuuu/internal-api/tasks';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  getTaskIdentifierForSearch,
  getTaskTicketLabel,
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
    getTaskTicketLabel(task),
    ...(task.ticket_projects ?? task.projects ?? []).map((project) =>
      project.ticket_key && project.ticket_number
        ? `${project.ticket_key}-${project.ticket_number}`
        : null
    ),
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

/** Pages fetched at once when loading every page of a board. */
const PARALLEL_PAGES = 4;

/** Sorted and filtered boards must not treat one page as the full task set. */
async function listAllBoardTaskPages(
  workspaceId: string,
  options: ListWorkspaceTasksOptions
): Promise<Task[]> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 200));
  const start = options.offset ?? 0;
  const page = (offset: number) =>
    listWorkspaceTasks(workspaceId, {
      ...options,
      includeCount: true,
      limit,
      offset,
    });

  // A personal board's page holds up to `limit` board tasks plus up to
  // `limit` external ones, both paged by the same offset, so pages step by
  // `limit` and loading continues while a page comes back at least full.
  const first = await page(start);
  const tasks: Task[] = [...first.tasks];
  let offset = start + limit;
  let last = first.tasks.length;
  let total = first.count;

  if (typeof total === 'number') {
    // The total is known, so its pages load a few at a time. Tasks added
    // while loading raise the total, which adds pages.
    while (last >= limit && offset < total) {
      const offsets: number[] = [];
      for (
        ;
        offsets.length < PARALLEL_PAGES && offset < total;
        offset += limit
      ) {
        offsets.push(offset);
      }
      for (const response of await Promise.all(offsets.map(page))) {
        tasks.push(...response.tasks);
        last = response.tasks.length;
        if (typeof response.count === 'number') {
          total = Math.max(total, response.count);
        }
      }
    }
    return mergeTasksById(tasks, []);
  }

  while (last >= limit) {
    const response = await page(offset);
    tasks.push(...response.tasks);
    offset += limit;
    last = response.tasks.length;
  }

  return mergeTasksById(tasks, []);
}

export async function listBoardTasksForSearch(
  workspaceId: string,
  options: ListWorkspaceTasksOptions
): Promise<Task[]> {
  const { nameQuery, identifierQuery } = buildTaskSearchQueryVariants(options);
  if (!identifierQuery) {
    return listAllBoardTaskPages(workspaceId, nameQuery);
  }

  const [nameResult, identifierResult] = await Promise.all([
    listAllBoardTaskPages(workspaceId, nameQuery),
    listWorkspaceTasks(workspaceId, {
      ...identifierQuery,
      limit: TICKET_IDENTIFIER_SEARCH_LIMIT,
    }),
  ]);

  return mergeTasksById(identifierResult.tasks, nameResult);
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
