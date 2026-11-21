import type {
  InfiniteData,
  QueryClient,
  QueryFilters,
  QueryKey,
} from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

export interface BoardTaskPage {
  tasks: Task[];
  nextCursor: string | null;
}

type PagedBoardTasks = InfiniteData<BoardTaskPage>;
type BoardTaskData = Task[] | PagedBoardTasks;
type TaskUpdater = (tasks: Task[] | undefined) => Task[] | undefined;

/** Board-wide paged task queries live under `['tasks-full', boardId, 'pages']`. */
function isPagedBoardTaskKey(key: QueryKey) {
  return key[0] === 'tasks-full' && key[2] === 'pages';
}

// A flattened read remembers the pages it came from, so restoring that
// snapshot can bring back those exact pages and keep any loaded after it.
const pagedSources = new WeakMap<Task[], PagedBoardTasks>();

function readTaskData(data: BoardTaskData | undefined) {
  if (!data || Array.isArray(data)) return data;
  const tasks = data.pages.flatMap((page) => page.tasks);
  pagedSources.set(tasks, data);
  return tasks;
}

function restorePagedSnapshot(
  current: PagedBoardTasks,
  source: PagedBoardTasks
): PagedBoardTasks {
  const sameStart = source.pageParams.every(
    (param, index) => current.pageParams[index] === param
  );
  if (!sameStart || current.pages.length <= source.pages.length) return source;
  return {
    pages: [...source.pages, ...current.pages.slice(source.pages.length)],
    pageParams: [
      ...source.pageParams,
      ...current.pageParams.slice(source.pageParams.length),
    ],
  };
}

// Optimistic operations work on a task array. Keep the server's cursors and
// number of loaded pages intact even when a mutation removes or inserts rows.
function patchTaskData(
  key: QueryKey,
  data: BoardTaskData | undefined,
  updater: TaskUpdater
): BoardTaskData | undefined {
  const paged = isPagedBoardTaskKey(key) || (data && !Array.isArray(data));
  // A paged query without its first page has no cursor to keep; writing an
  // array there would break the infinite query, so it waits for the server.
  if (paged && !data) return undefined;

  const tasks = readTaskData(data);
  const next = updater(tasks);
  if (!data || Array.isArray(data)) return next;
  if (!next || next === tasks) return data;

  const source = pagedSources.get(next);
  if (source) return restorePagedSnapshot(data, source);

  let start = 0;
  return {
    ...data,
    pages: data.pages.map((page, index) => {
      const end =
        index === data.pages.length - 1
          ? next.length
          : start + page.tasks.length;
      const pageTasks = next.slice(start, end);
      start = end;
      return { ...page, tasks: pageTasks };
    }),
  };
}

export function getBoardTaskQueries(
  client: QueryClient,
  filters: QueryFilters
) {
  return client
    .getQueriesData<BoardTaskData>(filters)
    .map(([key, data]): [QueryKey, Task[] | undefined] => [
      key,
      readTaskData(data),
    ]);
}

export function getBoardTaskQuery(client: QueryClient, key: QueryKey) {
  return readTaskData(client.getQueryData<BoardTaskData>(key));
}

export function setBoardTaskQueries(
  client: QueryClient,
  filters: QueryFilters,
  updater: TaskUpdater
) {
  for (const [key] of client.getQueriesData<BoardTaskData>(filters)) {
    setBoardTaskQuery(client, key, updater);
  }
}

export function setBoardTaskQuery(
  client: QueryClient,
  key: QueryKey,
  update: TaskUpdater | Task[] | undefined
) {
  client.setQueryData<BoardTaskData>(key, (data) =>
    patchTaskData(
      key,
      data,
      typeof update === 'function' ? update : () => update
    )
  );
}
