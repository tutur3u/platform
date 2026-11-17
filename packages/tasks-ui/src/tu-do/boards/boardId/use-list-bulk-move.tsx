import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createWorkspaceTaskList,
  listWorkspaceTaskLists,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import {
  type BulkListMoveResult,
  moveAllActiveListTasks,
  moveTaskIdsInBatches,
} from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { BulkProgressToast } from './bulk-progress-toast';

export type ListBulkMoveKind = 'archive' | 'move' | 'undo';

export type ListBulkMoveVariables = {
  kind: ListBulkMoveKind;
  toastId: string;
  /** Count shown in the toast before the server reports the real total. */
  total: number;
  fromBoardId: string;
  /** List whose tasks move when `taskIds` is omitted. */
  sourceListId: string;
  /** Explicit task ids (used by Undo); otherwise every active task moves. */
  taskIds?: string[];
  toBoardId: string;
  /** Destination list. Omitted for archive: the board's closed list is used. */
  toListId?: string;
};

type Snapshot = {
  fromTasks: Task[] | undefined;
  toTasks: Task[] | undefined;
};

type MoveOutcome = BulkListMoveResult & { toListId: string };

const tasksKey = (boardId: string) => ['tasks', boardId] as const;

function matchesVariables(variables: ListBulkMoveVariables) {
  const ids = variables.taskIds ? new Set(variables.taskIds) : null;
  return (task: Task) =>
    ids ? ids.has(task.id) : task.list_id === variables.sourceListId;
}

/**
 * Moves the matching cached tasks so cards leave their list at once. Without
 * a known destination list they are only removed; the settle refetch places
 * them.
 */
function applyOptimisticMove(
  queryClient: QueryClient,
  variables: ListBulkMoveVariables
) {
  const { fromBoardId, toBoardId, toListId } = variables;
  const matches = matchesVariables(variables);
  const fromTasks = queryClient.getQueryData<Task[]>(tasksKey(fromBoardId));
  const moving = (fromTasks ?? []).filter(matches);

  if (fromBoardId === toBoardId) {
    queryClient.setQueryData<Task[]>(tasksKey(fromBoardId), (old) => {
      if (!old) return old;
      if (!toListId) return old.filter((task) => !matches(task));
      return old.map((task) =>
        matches(task) ? { ...task, list_id: toListId } : task
      );
    });
    return;
  }

  queryClient.setQueryData<Task[]>(tasksKey(fromBoardId), (old) =>
    old?.filter((task) => !matches(task))
  );

  if (toListId) {
    const movingIds = new Set(moving.map((task) => task.id));
    queryClient.setQueryData<Task[]>(tasksKey(toBoardId), (old) => {
      if (!old) return old;
      return [
        ...old.filter((task) => !movingIds.has(task.id)),
        ...moving.map((task) => ({ ...task, list_id: toListId })),
      ];
    });
  }
}

/** Puts tasks the server could not move back where they were. */
function restoreFailedTasks(
  queryClient: QueryClient,
  variables: ListBulkMoveVariables,
  snapshot: Snapshot,
  failedTaskIds: string[]
) {
  if (failedTaskIds.length === 0) return;
  const failed = new Set(failedTaskIds);
  const originals = (snapshot.fromTasks ?? []).filter((task) =>
    failed.has(task.id)
  );

  queryClient.setQueryData<Task[]>(tasksKey(variables.fromBoardId), (old) => [
    ...(old ?? []).filter((task) => !failed.has(task.id)),
    ...originals,
  ]);

  if (variables.toBoardId !== variables.fromBoardId) {
    queryClient.setQueryData<Task[]>(tasksKey(variables.toBoardId), (old) =>
      old?.filter((task) => !failed.has(task.id))
    );
  }
}

async function resolveClosedListId(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  archivedListName: string
) {
  const isOpenClosedList = (list: TaskList) =>
    list.status === 'closed' && !list.deleted;
  const cached = queryClient
    .getQueryData<TaskList[]>(['task_lists', boardId])
    ?.find(isOpenClosedList);
  if (cached) return cached.id;

  const options =
    typeof window !== 'undefined'
      ? { baseUrl: window.location.origin }
      : undefined;
  const { lists } = await listWorkspaceTaskLists(wsId, boardId, options);
  const existing = lists.find(isOpenClosedList);
  if (existing) return existing.id;

  const { list } = await createWorkspaceTaskList(
    wsId,
    boardId,
    { name: archivedListName, status: 'closed', color: 'PURPLE' },
    options
  );
  queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
  return list.id;
}

const PROGRESS_KEYS = {
  archive: 'archiving_tasks_progress',
  move: 'moving_tasks_progress',
  undo: 'restoring_tasks_progress',
} as const;

const SUCCESS_KEYS = {
  archive: 'archived_tasks_successfully',
  move: 'moved_tasks_successfully',
  undo: 'tasks_restored',
} as const;

const PARTIAL_KEYS = {
  archive: 'archived_tasks_partially',
  move: 'moved_tasks_partially',
  undo: 'moved_tasks_partially',
} as const;

const ERROR_KEYS = {
  archive: 'failed_to_archive_tasks',
  move: 'failed_to_move_tasks',
  undo: 'failed_to_restore_tasks',
} as const;

/**
 * Optimistic "move every task of a list" for archive, move and Undo: cards
 * leave the list immediately, a toast tracks x/N while batched requests run,
 * failures roll back, and the finished toast offers Undo.
 */
export function useListBulkMove({
  wsId,
  broadcast,
  onSettled,
}: {
  wsId?: string;
  broadcast?:
    | ((event: string, payload: Record<string, unknown>) => void)
    | null;
  onSettled?: () => void;
}) {
  const t = useTranslations('common');
  const queryClient = useQueryClient();

  const showProgress = (
    variables: ListBulkMoveVariables,
    done: number,
    total: number
  ) => {
    toast.loading(
      <BulkProgressToast
        done={done}
        label={t(PROGRESS_KEYS[variables.kind])}
        total={total}
      />,
      { id: variables.toastId }
    );
  };

  const mutation = useMutation<
    MoveOutcome,
    Error,
    ListBulkMoveVariables,
    Snapshot
  >({
    mutationFn: async (variables) => {
      if (!wsId) throw new Error('Workspace ID is required to move tasks');

      const toListId =
        variables.toListId ??
        (await resolveClosedListId(
          queryClient,
          wsId,
          variables.toBoardId,
          t('archived')
        ));
      const target = {
        listId: toListId,
        targetBoardId:
          variables.toBoardId !== variables.fromBoardId
            ? variables.toBoardId
            : undefined,
      };
      const onProgress = ({ done, total }: { done: number; total: number }) =>
        showProgress(variables, done, total);

      const result = variables.taskIds
        ? await moveTaskIdsInBatches(
            wsId,
            variables.taskIds,
            target,
            onProgress
          )
        : await moveAllActiveListTasks(
            wsId,
            variables.sourceListId,
            target,
            onProgress
          );

      if (result.movedCount === 0 && result.failedTaskIds.length > 0) {
        throw new Error(`Failed to move ${result.failedTaskIds.length} tasks`);
      }

      return { ...result, toListId };
    },
    onMutate: async (variables) => {
      showProgress(variables, 0, variables.total);

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: tasksKey(variables.fromBoardId),
        }),
        queryClient.cancelQueries({ queryKey: tasksKey(variables.toBoardId) }),
      ]);

      const snapshot: Snapshot = {
        fromTasks: queryClient.getQueryData<Task[]>(
          tasksKey(variables.fromBoardId)
        ),
        toTasks: queryClient.getQueryData<Task[]>(
          tasksKey(variables.toBoardId)
        ),
      };

      applyOptimisticMove(queryClient, variables);
      return snapshot;
    },
    onError: (error, variables, snapshot) => {
      if (snapshot) {
        queryClient.setQueryData(
          tasksKey(variables.fromBoardId),
          snapshot.fromTasks
        );
        if (variables.toBoardId !== variables.fromBoardId) {
          queryClient.setQueryData(
            tasksKey(variables.toBoardId),
            snapshot.toTasks
          );
        }
      }
      console.error('Bulk list move failed:', error);
      toast.error(t(ERROR_KEYS[variables.kind]), { id: variables.toastId });
    },
    onSuccess: (result, variables, snapshot) => {
      if (snapshot) {
        restoreFailedTasks(
          queryClient,
          variables,
          snapshot,
          result.failedTaskIds
        );
      }

      const crossBoard = variables.toBoardId !== variables.fromBoardId;
      for (const taskId of result.movedTaskIds) {
        if (crossBoard) {
          broadcast?.('task:delete', { taskId });
        } else {
          broadcast?.('task:upsert', {
            task: { id: taskId, list_id: result.toListId },
          });
        }
      }

      const undo =
        variables.kind === 'undo'
          ? undefined
          : {
              label: t('undo'),
              onClick: () =>
                mutation.mutate({
                  kind: 'undo',
                  toastId: variables.toastId,
                  total: result.movedCount,
                  fromBoardId: variables.toBoardId,
                  sourceListId: result.toListId,
                  taskIds: result.movedTaskIds,
                  toBoardId: variables.fromBoardId,
                  toListId: variables.sourceListId,
                }),
            };

      const message =
        result.failedTaskIds.length > 0
          ? t(PARTIAL_KEYS[variables.kind], {
              moved: result.movedCount,
              failed: result.failedTaskIds.length,
            })
          : t(SUCCESS_KEYS[variables.kind], { count: result.movedCount });
      const show =
        result.failedTaskIds.length > 0 ? toast.warning : toast.success;

      show(message, {
        id: variables.toastId,
        action: undo,
        duration: undo ? 8000 : undefined,
      });
    },
    onSettled: (_result, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: tasksKey(variables.fromBoardId),
      });
      if (variables.toBoardId !== variables.fromBoardId) {
        queryClient.invalidateQueries({
          queryKey: tasksKey(variables.toBoardId),
        });
      }
      onSettled?.();
    },
  });

  return mutation;
}
