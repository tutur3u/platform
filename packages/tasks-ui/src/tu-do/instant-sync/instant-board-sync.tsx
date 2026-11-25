'use client';

import { useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  createTask,
  reorderTask,
  transformTaskRecord,
  updateTask,
} from '@tuturuuu/utils/task-helper';
import { useMemo } from 'react';
import {
  type BoardTaskApi,
  createBoardTaskActions,
} from './board-task-actions';
import { createBoardTaskCollection } from './board-task-collection';
import type { InstantBoardSync } from './instant-board-sync-context';

/** Server calls reuse the shared task helpers built on internal-api. */
export function createInternalBoardTaskApi(wsId: string): BoardTaskApi {
  return {
    createTask: async (listId, input) =>
      (await createTask(wsId, listId, input)) as Task,
    updateTask: async (taskId, updates) =>
      transformTaskRecord(await updateTask(wsId, taskId, updates)) as Task,
    reorderTask: (taskId, newListId, newSortKey) =>
      reorderTask(wsId, taskId, newListId, newSortKey),
  };
}

export function useInstantBoardSyncController({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}): InstantBoardSync {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const collection = createBoardTaskCollection({ boardId, queryClient });
    const actions = createBoardTaskActions({
      api: createInternalBoardTaskApi(wsId),
      boardId,
      collection,
      queryClient,
    });
    return { actions, boardId, collection };
  }, [boardId, queryClient, wsId]);
}

/**
 * Live board rows: the synced query cache plus every pending optimistic
 * transaction, recomputed incrementally by TanStack DB.
 */
export function useInstantBoardTasks(sync: InstantBoardSync): Task[] {
  // This release takes no dependency list; the caller keys the component by
  // board so a new board always gets a fresh live query.
  const { data } = useLiveQuery((q) => q.from({ task: sync.collection }));
  return (data ?? []) as Task[];
}
