import { createTransaction } from '@tanstack/db';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  isTaskBoardCompletedStatus,
  isTaskBoardTerminalStatus,
} from '@tuturuuu/utils/task-list-status';
import {
  type BoardTaskCollection,
  boardTasksQueryKey,
  revertTaskRowInBoardCaches,
  upsertServerTaskIntoBoardCaches,
} from './board-task-collection';

export type InstantCreateTaskInput = Partial<Task> & {
  name: string;
  assignee_ids?: string[];
  label_ids?: string[];
};

export type InstantReorderInput = {
  taskId: string;
  newListId: string;
  newSortKey: number;
  targetListStatus?: TaskList['status'] | null;
  /** Pre-drop snapshot supplied by the drag-and-drop preview, if any. */
  optimisticPreviousTasks?: Task[];
  /** Pre-drop snapshots of the `['tasks-full', boardId, ...]` caches. */
  optimisticPreviousFullTaskEntries?: [QueryKey, Task[] | undefined][];
};

/** Server boundary, injected so the pilot stays testable without network. */
export interface BoardTaskApi {
  createTask: (listId: string, input: InstantCreateTaskInput) => Promise<Task>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<Task>;
  reorderTask: (
    taskId: string,
    newListId: string,
    newSortKey: number
  ) => Promise<Task>;
}

const EMPTY_LIST_SORT_KEY = 1_000_000_000;

function topSortKeyForList(collection: BoardTaskCollection, listId: string) {
  let minimum: number | null = null;
  for (const task of collection.values()) {
    if (task.list_id !== listId) continue;
    const key = task.sort_key;
    if (typeof key !== 'number' || !Number.isFinite(key)) continue;
    if (minimum === null || key < minimum) minimum = key;
  }
  return minimum === null
    ? EMPTY_LIST_SORT_KEY
    : Math.max(Number.MIN_SAFE_INTEGER, minimum - 1);
}

export function applyReorderToTask(
  task: Task,
  input: Pick<
    InstantReorderInput,
    'newListId' | 'newSortKey' | 'targetListStatus'
  >,
  now: Date
): Task {
  const timestamp = now.toISOString();
  const completed = isTaskBoardCompletedStatus(input.targetListStatus);
  const terminal = isTaskBoardTerminalStatus(input.targetListStatus);
  return {
    ...task,
    list_id: input.newListId,
    sort_key: input.newSortKey,
    completed,
    completed_at: completed ? (task.completed_at ?? timestamp) : null,
    closed_at: terminal ? (task.closed_at ?? timestamp) : null,
  } as Task;
}

/**
 * Run one optimistic write as a TanStack DB transaction.
 *
 * `apply` mutates the collection (optimistic layer only). `persist` calls the
 * server and writes the confirmed row into the synced query cache. If `persist`
 * throws, TanStack DB discards exactly this transaction's optimistic state and
 * the promise rejects with the original error so the caller can notify the
 * user. A later write to the same task is already persisting and keeps its own
 * overlay until it settles.
 */
export async function runOptimistic<T>(
  apply: () => void,
  persist: () => Promise<T>
): Promise<T> {
  let result: { value: T } | null = null;
  const tx = createTransaction<Task>({
    autoCommit: false,
    mutationFn: async () => {
      result = { value: await persist() };
    },
  });
  tx.mutate(apply);
  // A transaction without a visible change skips its mutationFn. That happens
  // when the drag preview already wrote the same values into the synced cache,
  // or when the row is not in this collection. The write must still persist.
  const hasOptimisticChange = tx.mutations.length > 0;
  await tx.commit();
  if (!hasOptimisticChange) return persist();
  if (!result) throw new Error('Instant board sync: missing server result');
  return (result as { value: T }).value;
}

export function createBoardTaskActions({
  api,
  boardId,
  collection,
  createTempId = () => `optimistic-${crypto.randomUUID()}`,
  now = () => new Date(),
  queryClient,
}: {
  api: BoardTaskApi;
  boardId: string;
  collection: BoardTaskCollection;
  createTempId?: () => string;
  now?: () => Date;
  queryClient: QueryClient;
}) {
  const cancelInFlightReads = () =>
    queryClient.cancelQueries(
      { queryKey: boardTasksQueryKey(boardId) },
      { revert: false }
    );

  function createTask(listId: string, input: InstantCreateTaskInput) {
    const tempId = createTempId();
    const createdAt = now().toISOString();
    const optimistic = {
      ...input,
      id: tempId,
      list_id: listId,
      name: input.name.trim(),
      sort_key: input.sort_key ?? topSortKeyForList(collection, listId),
      created_at: createdAt,
      assignees: input.assignees ?? [],
      labels: input.labels ?? [],
      projects: input.projects ?? [],
      _isOptimistic: true,
    } as Task;

    return runOptimistic(
      () => collection.insert(optimistic),
      async () => {
        void cancelInFlightReads();
        const created = await api.createTask(listId, input);
        upsertServerTaskIntoBoardCaches(queryClient, boardId, created, {
          replaceTaskId: tempId,
        });
        return created;
      }
    );
  }

  function updateTask(taskId: string, updates: Partial<Task>) {
    // The server ignores undefined fields, so the optimistic row must too.
    const { id: _ignoredId, ...rest } = updates;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined)
    ) as Partial<Task>;
    return runOptimistic(
      () => {
        if (!collection.has(taskId)) return;
        collection.update(taskId, (draft) => {
          Object.assign(draft, patch);
        });
      },
      async () => {
        void cancelInFlightReads();
        const saved = await api.updateTask(taskId, patch);
        upsertServerTaskIntoBoardCaches(queryClient, boardId, saved, {
          localMutationAt: now().getTime(),
        });
        return saved;
      }
    );
  }

  async function reorderTask(input: InstantReorderInput) {
    const at = now();
    const cached = queryClient.getQueryData<Task[]>(
      boardTasksQueryKey(boardId)
    );
    // The drag preview may already have written speculative state into the
    // synced cache. Remember it so a failure reverts only this row, and only
    // while nobody else has changed it since.
    const speculative = cached?.find((task) => task.id === input.taskId);
    const previous = input.optimisticPreviousTasks?.find(
      (task) => task.id === input.taskId
    );

    try {
      return await runOptimistic(
        () => {
          if (!collection.has(input.taskId)) return;
          collection.update(input.taskId, (draft) => {
            Object.assign(draft, applyReorderToTask(draft as Task, input, at));
          });
        },
        async () => {
          void cancelInFlightReads();
          const saved = await api.reorderTask(
            input.taskId,
            input.newListId,
            input.newSortKey
          );
          upsertServerTaskIntoBoardCaches(queryClient, boardId, saved, {
            localMutationAt: at.getTime(),
          });
          return saved;
        }
      );
    } catch (error) {
      if (speculative && previous && speculative !== previous) {
        revertTaskRowInBoardCaches(queryClient, boardId, {
          taskId: input.taskId,
          previous,
          previousFullEntries: input.optimisticPreviousFullTaskEntries,
          speculative,
        });
      }
      throw error;
    }
  }

  return { createTask, updateTask, reorderTask };
}

export type BoardTaskActions = ReturnType<typeof createBoardTaskActions>;
