'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from '@tuturuuu/ui/sonner';
import { ToastProgress } from '@tuturuuu/ui/toast-progress';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import {
  type BoardTaskCacheSnapshot,
  onlyTaskIds,
  reinsertSnapshotTasks,
  restoreBroadcastTask,
} from './bulk-delete-cache';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import {
  type BulkTaskWorkspaceGroup,
  bulkWorkspaceTasksByEffectiveWorkspace,
  getBulkTaskWorkspaceGroups,
  getInternalApiOptions,
  snapshotBoardTaskCaches,
  updateBoardTaskCaches,
} from './bulk-operation-utils';

/**
 * Tasks per `/tasks/bulk` request for bulk delete and its Undo. Matches the
 * list archive/move chunk, so a large selection is a few requests and the
 * toast reports real progress.
 */
export const BULK_DELETE_CHUNK_SIZE = 50;

/** How long the finished delete toast keeps its Undo action. */
const UNDO_TOAST_DURATION_MS = 8000;

/**
 * Restored cards are broadcast in groups of this size, each after the board
 * channel's 50ms send debounce, so a large Undo is several bounded messages
 * instead of one.
 */
const RESTORE_BROADCAST_CHUNK = BULK_DELETE_CHUNK_SIZE;
const RESTORE_BROADCAST_SPACING_MS = 100;

export type BulkDeleteVariables = {
  taskIds: string[];
  workspaceGroups?: BulkTaskWorkspaceGroup[];
  /** Undo of an earlier delete: sets `deleted: false` on the same ids. */
  restore?: {
    /** Board caches captured before the delete, used to put the cards back. */
    snapshot: BoardTaskCacheSnapshot;
  };
  /**
   * Toast that tracks this run. Without it the run still shows its start and
   * result, but not per-batch progress.
   */
  toastId?: string;
};

type BulkDeleteResult = {
  count: number;
  taskIds: string[];
  succeededTaskIds: string[];
  failures: Array<{ taskId: string; error: string }>;
};

type BulkDeleteContext = {
  snapshot: BoardTaskCacheSnapshot;
  toastId: string;
  /** Source-workspace groups, resolved before the cards leave the cache. */
  workspaceGroups: BulkTaskWorkspaceGroup[];
};

let toastSequence = 0;
export function nextBulkDeleteToastId() {
  toastSequence += 1;
  return `bulk-delete-${Date.now()}-${toastSequence}`;
}

/**
 * Optimistic bulk delete with batched requests, an x/N progress toast,
 * rollback of tasks the server did not delete, and Undo, which restores the
 * same ids (`deleted: false`) and puts the cards back from the snapshot.
 */
export function useBulkDeleteTasks(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  clearSelection: () => void,
  setBulkDeleteOpen: (open: boolean) => void,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  // onMutate resolves the workspace groups while the cards are still cached;
  // TanStack hands mutationFn the same variables object, so they are keyed by it.
  const [resolvedGroups] = useState(
    () => new WeakMap<BulkDeleteVariables, BulkTaskWorkspaceGroup[]>()
  );

  const broadcastRestored = (
    snapshot: BoardTaskCacheSnapshot,
    taskIds: string[]
  ) => {
    if (!broadcast) return;
    for (
      let offset = 0, chunk = 0;
      offset < taskIds.length;
      offset += RESTORE_BROADCAST_CHUNK, chunk += 1
    ) {
      const ids = taskIds.slice(offset, offset + RESTORE_BROADCAST_CHUNK);
      const send = () => {
        for (const taskId of ids) {
          broadcast('task:upsert', {
            task: restoreBroadcastTask(snapshot, taskId),
          });
        }
      };
      if (chunk === 0) send();
      else setTimeout(send, chunk * RESTORE_BROADCAST_SPACING_MS);
    }
  };

  const showProgress = (
    variables: BulkDeleteVariables,
    toastId: string,
    done: number,
    total: number
  ) => {
    const label = variables.restore
      ? (i18n?.restoringTasksProgress() ?? 'Restoring tasks')
      : (i18n?.deletingTasksProgress() ?? 'Deleting tasks');
    toast.loading(<ToastProgress done={done} label={label} total={total} />, {
      id: toastId,
    });
  };

  const mutation = useMutation<
    BulkDeleteResult,
    Error,
    BulkDeleteVariables,
    BulkDeleteContext
  >({
    mutationFn: async (variables) => {
      const { taskIds, restore } = variables;
      const workspaceGroups =
        resolvedGroups.get(variables) ?? variables.workspaceGroups;
      const toastId = variables.toastId ?? '';

      const result = await bulkWorkspaceTasksByEffectiveWorkspace({
        queryClient,
        boardId,
        defaultWorkspaceId: wsId,
        taskIds,
        operation: {
          type: 'update_fields',
          updates: { deleted: !restore },
        },
        options: getInternalApiOptions(),
        workspaceGroups,
        chunkSize: BULK_DELETE_CHUNK_SIZE,
        onProgress: toastId
          ? ({ done, total }) => showProgress(variables, toastId, done, total)
          : undefined,
      });

      if (result.successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to ${restore ? 'restore' : 'delete'} all ${taskIds.length} tasks`
        );
      }

      const failedTaskIds = new Set<string>(
        result.failures.map((failure: { taskId: string }) => failure.taskId)
      );

      return {
        count: result.successCount,
        taskIds,
        succeededTaskIds: taskIds.filter((id) => !failedTaskIds.has(id)),
        failures: result.failures,
      };
    },
    onMutate: async (variables) => {
      // Callers pass the id so batch progress can update this same toast.
      const toastId = variables.toastId ?? nextBulkDeleteToastId();

      if (!variables.restore) {
        // Confirming closes the dialog at once; progress and Undo continue
        // in the toast.
        setBulkDeleteOpen(false);
        clearSelection();
      }
      showProgress(variables, toastId, 0, variables.taskIds.length);

      const workspaceGroups =
        variables.workspaceGroups ??
        getBulkTaskWorkspaceGroups({
          queryClient,
          boardId,
          defaultWorkspaceId: wsId,
          taskIds: variables.taskIds,
        });
      resolvedGroups.set(variables, workspaceGroups);

      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const snapshot = snapshotBoardTaskCaches(queryClient, boardId);

      if (variables.restore) {
        reinsertSnapshotTasks(
          queryClient,
          boardId,
          variables.restore.snapshot,
          variables.taskIds
        );
      } else {
        const taskIdSet = new Set(variables.taskIds);
        updateBoardTaskCaches(queryClient, boardId, (old) =>
          old ? old.filter((task) => !taskIdSet.has(task.id)) : old
        );
      }

      return { snapshot, toastId, workspaceGroups };
    },
    onError: (error, variables, context) => {
      // Undo only this run's cards, so a concurrent bulk delete keeps its own.
      if (variables.restore) {
        const restoredIds = new Set(variables.taskIds);
        updateBoardTaskCaches(queryClient, boardId, (old) =>
          old ? old.filter((task) => !restoredIds.has(task.id)) : old
        );
      } else if (context) {
        reinsertSnapshotTasks(
          queryClient,
          boardId,
          context.snapshot,
          variables.taskIds
        );
      }
      console.error(
        variables.restore ? 'Bulk restore failed' : 'Bulk delete failed',
        error
      );
      const message = variables.restore
        ? (i18n?.failedRestoreTasks() ?? 'Failed to restore deleted tasks')
        : (i18n?.failedDeleteTasks() ?? 'Failed to delete selected tasks');
      toast.error(message, { id: context?.toastId ?? variables.toastId });
    },
    onSuccess: (data, variables, context) => {
      const failedTaskIds = new Set<string>(
        data.failures.map((failure) => failure.taskId)
      );
      const toastId = context?.toastId ?? variables.toastId;

      if (variables.restore) {
        // Tasks the server did not restore are still deleted: take them out.
        if (failedTaskIds.size > 0) {
          updateBoardTaskCaches(queryClient, boardId, (old) =>
            old ? old.filter((task) => !failedTaskIds.has(task.id)) : old
          );
        }
        broadcastRestored(variables.restore.snapshot, data.succeededTaskIds);

        if (data.failures.length > 0) {
          toast.warning(
            i18n?.partialRestoreCompletedTitle() ?? 'Partial restore completed',
            {
              id: toastId,
              description:
                i18n?.restoredPartialDescription(
                  data.count,
                  data.failures.length
                ) ??
                `${data.count} task${data.count === 1 ? '' : 's'} restored, ${data.failures.length} failed to restore`,
            }
          );
        } else {
          toast.success(i18n?.tasksRestoredTitle() ?? 'Tasks restored', {
            id: toastId,
            description:
              i18n?.restoredDescription(data.count) ??
              `${data.count} task${data.count === 1 ? '' : 's'} restored`,
          });
        }
        return;
      }

      if (context) {
        reinsertSnapshotTasks(
          queryClient,
          boardId,
          context.snapshot,
          failedTaskIds
        );
      }

      for (const taskId of data.succeededTaskIds) {
        broadcast?.('task:delete', { taskId });
      }

      const snapshot = context?.snapshot;
      const deletedGroups = context?.workspaceGroups ?? [];
      // Sonner keeps a dismissed toast clickable while it animates out.
      let undone = false;
      const undo =
        snapshot && data.succeededTaskIds.length > 0
          ? {
              label: i18n?.undoAction() ?? 'Undo',
              onClick: () => {
                if (undone) return;
                undone = true;
                mutation.mutate({
                  taskIds: data.succeededTaskIds,
                  workspaceGroups: onlyTaskIds(
                    deletedGroups,
                    data.succeededTaskIds
                  ),
                  restore: { snapshot },
                  // Its own id: Sonner removes the clicked toast, which must
                  // not take the restore progress toast with it.
                  toastId: `${toastId}-undo`,
                });
              },
            }
          : undefined;
      const undoOptions = undo
        ? { action: undo, duration: UNDO_TOAST_DURATION_MS }
        : {};

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialDeletionCompletedTitle() ?? 'Partial deletion completed',
          {
            id: toastId,
            description:
              i18n?.deletedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} deleted, ${data.failures.length} failed to delete`,
            ...undoOptions,
          }
        );
      } else {
        toast.success(
          i18n?.deletedSelectedTasksTitle() ?? 'Deleted selected tasks',
          {
            id: toastId,
            description:
              i18n?.deletedDescription(data.count) ??
              `${data.count} task${data.count === 1 ? '' : 's'} deleted`,
            ...undoOptions,
          }
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      resolvedGroups.delete(variables);
      // The recycle bin lists what this run deleted or restored. Visible
      // board arrays are already patched, so they are not refetched.
      queryClient.invalidateQueries({ queryKey: ['deleted-tasks', boardId] });
    },
  });

  return mutation;
}
