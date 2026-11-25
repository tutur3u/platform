import { createCollection } from '@tanstack/db';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

/**
 * Instant board sync — read model.
 *
 * The board's TanStack Query cache (`['tasks', boardId]`) stays the synced
 * source of truth on the client: progressive list loading, revalidation and the
 * realtime broadcast handler keep writing to it exactly as before. This module
 * mirrors that cache into a TanStack DB collection so the board can read through
 * `useLiveQuery` and layer per-transaction optimistic state on top of it.
 *
 * Sync writes that arrive while an optimistic transaction is persisting are
 * held by TanStack DB and applied together with the drop of that transaction's
 * optimistic state, so the UI never flickers back to the pre-mutation row.
 */

export function boardTasksQueryKey(boardId: string) {
  return ['tasks', boardId] as const;
}

export type BoardTaskChange =
  | { type: 'insert'; value: Task }
  | { type: 'update'; value: Task }
  | { type: 'delete'; key: string };

/**
 * Diff the previously mirrored rows against the next cache snapshot. Rows are
 * compared by reference: the query cache replaces changed rows immutably, so an
 * unchanged reference means an unchanged row.
 */
export function diffBoardTasks(
  previous: ReadonlyMap<string, Task>,
  next: readonly Task[] | undefined
): { changes: BoardTaskChange[]; rows: Map<string, Task> } {
  const rows = new Map<string, Task>();
  const changes: BoardTaskChange[] = [];

  for (const task of next ?? []) {
    if (!task?.id || rows.has(task.id)) continue;
    rows.set(task.id, task);

    const before = previous.get(task.id);
    if (!before) changes.push({ type: 'insert', value: task });
    else if (before !== task) changes.push({ type: 'update', value: task });
  }

  for (const key of previous.keys()) {
    if (!rows.has(key)) changes.push({ type: 'delete', key });
  }

  return { changes, rows };
}

function isBoardTasksKey(queryKey: QueryKey, boardId: string) {
  return (
    queryKey.length === 2 && queryKey[0] === 'tasks' && queryKey[1] === boardId
  );
}

export function createBoardTaskCollection({
  boardId,
  queryClient,
  gcTime = 60_000,
}: {
  boardId: string;
  queryClient: QueryClient;
  gcTime?: number;
}) {
  return createCollection<Task, string>({
    id: `instant-board-tasks:${boardId}`,
    getKey: (task) => task.id,
    gcTime,
    startSync: true,
    sync: {
      rowUpdateMode: 'full',
      sync: ({ begin, write, commit, markReady }) => {
        let mirrored: Map<string, Task> = new Map();
        let lastData: unknown;

        const mirror = (data: Task[] | undefined) => {
          if (data === lastData) return;
          lastData = data;

          const { changes, rows } = diffBoardTasks(mirrored, data);
          mirrored = rows;
          if (changes.length === 0) return;

          begin();
          for (const change of changes) {
            if (change.type === 'delete') {
              write({ type: 'delete', key: change.key });
            } else {
              write({ type: change.type, value: change.value });
            }
          }
          commit();
        };

        mirror(
          queryClient.getQueryData<Task[]>(boardTasksQueryKey(boardId)) ?? []
        );
        markReady();

        return queryClient.getQueryCache().subscribe((event) => {
          if (!isBoardTasksKey(event.query.queryKey, boardId)) return;
          if (event.type === 'removed') {
            mirror([]);
            return;
          }
          if (event.type !== 'added' && event.type !== 'updated') return;
          mirror(event.query.state.data as Task[] | undefined);
        });
      },
    },
  });
}

export type BoardTaskCollection = ReturnType<typeof createBoardTaskCollection>;

type TaskCacheUpdater = (tasks: Task[] | undefined) => Task[] | undefined;

function updateBoardTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  updater: TaskCacheUpdater
) {
  queryClient.setQueryData<Task[]>(boardTasksQueryKey(boardId), updater);
  queryClient.setQueriesData<Task[]>(
    { queryKey: ['tasks-full', boardId] },
    updater
  );
}

/**
 * Write a confirmed server row into the synced cache. Called from inside a
 * persisting transaction, so TanStack DB swaps the optimistic row for this one
 * atomically when the transaction settles.
 */
export function upsertServerTaskIntoBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  serverTask: Task,
  {
    localMutationAt,
    replaceTaskId = serverTask.id,
  }: { localMutationAt?: number; replaceTaskId?: string } = {}
) {
  // The `_localMutationAt` stamp keeps the progressive loader from merging a
  // stale in-flight page over this confirmed local write.
  const confirmed =
    localMutationAt === undefined
      ? serverTask
      : ({ ...serverTask, _localMutationAt: localMutationAt } as Task);
  updateBoardTaskCaches(queryClient, boardId, (tasks) => {
    if (!tasks) return tasks;
    let found = false;
    const next: Task[] = [];
    for (const task of tasks) {
      if (task.id === replaceTaskId || task.id === serverTask.id) {
        if (found) continue;
        found = true;
        next.push({ ...task, ...confirmed });
      } else {
        next.push(task);
      }
    }
    if (!found) next.push(confirmed);
    return next;
  });
}

type LocallyMarkedTask = Task & { _localMutationAt?: number };

function isSameSpeculativeRow(current: Task, speculative: Task) {
  if (current === speculative) return true;
  const marker = (speculative as LocallyMarkedTask)._localMutationAt;
  return (
    typeof marker === 'number' &&
    (current as LocallyMarkedTask)._localMutationAt === marker
  );
}

/**
 * Row-level revert of a single task in the synced cache. Used when a caller
 * (the drag-and-drop preview) wrote speculative state into the cache itself:
 * only that row returns to its previous value, so concurrent realtime changes
 * to other rows survive the rollback. When the row no longer is the
 * speculative value (another user or tab changed it since), it is left alone:
 * the newer synced value wins over our failed write.
 */
export function revertTaskRowInBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  {
    taskId,
    previous,
    previousFullEntries = [],
    speculative,
  }: {
    taskId: string;
    previous: Task | undefined;
    previousFullEntries?: [QueryKey, Task[] | undefined][];
    speculative: Task;
  }
) {
  const revertTo =
    (previousRow: Task | undefined) => (tasks: Task[] | undefined) => {
      if (!tasks) return tasks;
      const current = tasks.find((task) => task.id === taskId);
      if (!current || !isSameSpeculativeRow(current, speculative)) return tasks;
      if (!previousRow) return tasks.filter((task) => task.id !== taskId);
      return tasks.map((task) => (task.id === taskId ? previousRow : task));
    };

  queryClient.setQueryData<Task[]>(
    boardTasksQueryKey(boardId),
    revertTo(previous)
  );
  // Each tasks-full cache holds its own row shape, so it reverts only from its
  // own snapshot.
  for (const [queryKey, previousTasks] of previousFullEntries) {
    if (!previousTasks) continue;
    queryClient.setQueryData<Task[]>(
      queryKey,
      revertTo(previousTasks.find((task) => task.id === taskId))
    );
  }
}
