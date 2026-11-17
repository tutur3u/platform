import { bulkWorkspaceTasks } from '@tuturuuu/internal-api/tasks';

import { getBrowserApiOptions, listAllActiveTasksForList } from './shared';

/**
 * Tasks sent per `/tasks/bulk` request. The route accepts up to 200; smaller
 * chunks keep each request short and let callers report real progress on
 * long lists while staying a handful of requests instead of one per task.
 */
export const BULK_LIST_MOVE_CHUNK_SIZE = 50;

export type BulkListMoveTarget = {
  listId: string;
  /** Set only when the destination list lives on another board. */
  targetBoardId?: string;
};

export type BulkListMoveProgress = {
  done: number;
  total: number;
};

export type BulkListMoveResult = {
  success: true;
  movedCount: number;
  movedTaskIds: string[];
  failedTaskIds: string[];
};

export async function moveTaskIdsInBatches(
  wsId: string,
  taskIds: string[],
  target: BulkListMoveTarget,
  onProgress?: (progress: BulkListMoveProgress) => void
): Promise<BulkListMoveResult> {
  const uniqueTaskIds = [...new Set(taskIds)];
  const total = uniqueTaskIds.length;
  const movedTaskIds: string[] = [];
  const failedTaskIds: string[] = [];

  onProgress?.({ done: 0, total });

  for (
    let offset = 0;
    offset < uniqueTaskIds.length;
    offset += BULK_LIST_MOVE_CHUNK_SIZE
  ) {
    const chunk = uniqueTaskIds.slice(
      offset,
      offset + BULK_LIST_MOVE_CHUNK_SIZE
    );

    try {
      const response = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds: chunk,
          operation: {
            type: 'move_to_list',
            listId: target.listId,
            ...(target.targetBoardId
              ? { targetBoardId: target.targetBoardId }
              : {}),
          },
        },
        getBrowserApiOptions()
      );

      const succeeded = new Set(response.succeededTaskIds ?? []);
      for (const taskId of chunk) {
        if (succeeded.has(taskId)) {
          movedTaskIds.push(taskId);
        } else {
          failedTaskIds.push(taskId);
        }
      }
    } catch (error) {
      console.error('Bulk move chunk failed:', error);
      failedTaskIds.push(...chunk);
    }

    onProgress?.({
      done: Math.min(offset + chunk.length, total),
      total,
    });
  }

  return {
    success: true,
    movedCount: movedTaskIds.length,
    movedTaskIds,
    failedTaskIds,
  };
}

/**
 * Moves every active task of a list. Task ids come from the server so tasks
 * hidden by board filters or pagination are included.
 */
export async function moveAllActiveListTasks(
  wsId: string,
  sourceListId: string,
  target: BulkListMoveTarget,
  onProgress?: (progress: BulkListMoveProgress) => void
): Promise<BulkListMoveResult> {
  const tasks = await listAllActiveTasksForList(wsId, sourceListId);
  return moveTaskIdsInBatches(
    wsId,
    tasks.map((task) => task.id),
    target,
    onProgress
  );
}
