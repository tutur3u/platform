import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type {
  BulkTaskWorkspaceGroup,
  snapshotBoardTaskCaches,
} from './bulk-operation-utils';

export type BoardTaskCacheSnapshot = ReturnType<typeof snapshotBoardTaskCaches>;

function findSnapshotTask(snapshot: BoardTaskCacheSnapshot, taskId: string) {
  const fromBoard = snapshot.previousTasks?.find((task) => task.id === taskId);
  if (fromBoard) return fromBoard;
  for (const [, tasks] of snapshot.previousFullTasks) {
    const task = tasks?.find((item) => item.id === taskId);
    if (task) return task;
  }
  return undefined;
}

/**
 * Card fields for the restore broadcast. Peers need the row (with `name`) to
 * insert a card they removed; the description is left out to keep a large
 * batch small and loads with the card's detail.
 */
export function restoreBroadcastTask(
  snapshot: BoardTaskCacheSnapshot,
  taskId: string
): Record<string, unknown> {
  const task = findSnapshotTask(snapshot, taskId);
  if (!task) return { id: taskId, deleted_at: null };
  const { description: _description, ...card } = task;
  return { ...card, deleted_at: null };
}

/**
 * Puts `taskIds` back into each board cache from that cache's own snapshot.
 * A cache that never held a task, or has no data, is left as it is.
 */
export function reinsertSnapshotTasks(
  queryClient: QueryClient,
  boardId: string,
  snapshot: BoardTaskCacheSnapshot,
  taskIds: Iterable<string>
) {
  const ids = new Set(taskIds);
  if (ids.size === 0) return;

  const entries: [QueryKey, Task[] | undefined][] = [
    [['tasks', boardId], snapshot.previousTasks],
    ...snapshot.previousFullTasks,
  ];

  for (const [queryKey, previous] of entries) {
    const restored = (previous ?? []).filter((task) => ids.has(task.id));
    if (!previous || restored.length === 0) continue;
    const order = new Map(previous.map((task, index) => [task.id, index]));

    queryClient.setQueryData<Task[]>(queryKey, (old) => {
      if (!old) return old;
      const present = new Set(old.map((task) => task.id));
      const merged = [
        ...old,
        ...restored.filter((task) => !present.has(task.id)),
      ];
      return merged
        .map((task, index) => ({ task, index }))
        .sort((a, b) => {
          const aOrder = order.get(a.task.id);
          const bOrder = order.get(b.task.id);
          if (aOrder !== undefined && bOrder !== undefined) {
            return aOrder - bOrder;
          }
          return a.index - b.index;
        })
        .map(({ task }) => task);
    });
  }
}

export function onlyTaskIds(
  groups: BulkTaskWorkspaceGroup[],
  taskIds: Iterable<string>
): BulkTaskWorkspaceGroup[] {
  const keep = new Set(taskIds);
  return groups
    .map((group) => ({
      workspaceId: group.workspaceId,
      taskIds: group.taskIds.filter((taskId) => keep.has(taskId)),
    }))
    .filter((group) => group.taskIds.length > 0);
}
