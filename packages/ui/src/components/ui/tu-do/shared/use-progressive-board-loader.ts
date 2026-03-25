'use client';

import { useQueryClient } from '@tanstack/react-query';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ListPaginationState,
  ProgressiveLoaderValue,
} from './progressive-loader-context';

const PAGE_SIZE = 50;
const LOCAL_MUTATION_MARKER_TTL_MS = 30_000;
const REVALIDATE_LIST_CONCURRENCY = 2;

/**
 * Manages per-list pagination state and merges results into the shared
 * ['tasks', boardId] TanStack Query cache. Each list loads independently;
 * tasks are deduplicated on merge so overlaps (e.g. from realtime) are safe.
 */
export function useProgressiveBoardLoader(
  wsId: string,
  boardId: string
): ProgressiveLoaderValue {
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState<
    Record<string, ListPaginationState>
  >({});
  const paginationRef = useRef<Record<string, ListPaginationState>>({});

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const loadListPage = useCallback(
    async (listId: string, page: number = 0) => {
      // Guard against duplicate in-flight requests for the same page
      setPagination((prev) => {
        const current = prev[listId];
        if (current?.isLoading && current.page === page) return prev;
        return {
          ...prev,
          [listId]: {
            page,
            hasMore: current?.hasMore ?? true,
            totalCount: current?.totalCount ?? 0,
            isLoading: true,
            isInitialLoad: page === 0 && !current,
          },
        };
      });

      try {
        const requestStartedAt = Date.now();
        const payload = await listWorkspaceTasks(wsId, {
          listId,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        const tasks = payload.tasks ?? [];
        const hasMore = tasks.length === PAGE_SIZE;
        const totalCount = page * PAGE_SIZE + tasks.length + (hasMore ? 1 : 0);
        const result = {
          tasks,
          hasMore,
          totalCount,
        };

        // Merge into the shared ['tasks', boardId] cache (dedup by task ID)
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            const existing = old ?? [];
            const incomingById = new Map(
              result.tasks.map((task) => [task.id, task] as const)
            );

            const mergedExisting = existing.map((task) => {
              const incomingTask = incomingById.get(task.id);
              if (!incomingTask) return task;

              incomingById.delete(task.id);

              // Guard against stale in-flight list responses overriding a task
              // that was moved locally after this request started.
              if (task.list_id !== incomingTask.list_id) {
                const localTask = task as Task & {
                  _localMutationAt?: number;
                };
                const localMutationAt = localTask._localMutationAt;
                const hasFreshLocalMutation =
                  typeof localMutationAt === 'number' &&
                  localMutationAt > requestStartedAt &&
                  Date.now() - localMutationAt < LOCAL_MUTATION_MARKER_TTL_MS;

                if (hasFreshLocalMutation) {
                  return task;
                }
              }

              const taskWithoutLocalMutationAt = {
                ...(task as Task & { _localMutationAt?: number }),
              };
              delete taskWithoutLocalMutationAt._localMutationAt;

              return { ...taskWithoutLocalMutationAt, ...incomingTask };
            });

            return [...mergedExisting, ...incomingById.values()];
          }
        );

        setPagination((prev) => ({
          ...prev,
          [listId]: {
            page,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
            isLoading: false,
            isInitialLoad: false,
          },
        }));

        return result;
      } catch (error) {
        // On failure, mark as not loading so the column can retry
        setPagination((prev) => ({
          ...prev,
          [listId]: {
            ...(prev[listId] ?? {
              page: 0,
              hasMore: true,
              totalCount: 0,
              isInitialLoad: false,
            }),
            isLoading: false,
          },
        }));
        throw error;
      }
    },
    [boardId, queryClient, wsId]
  );

  const revalidateLoadedLists = useCallback(async () => {
    const snapshot = paginationRef.current;
    const loadedListIds = Object.entries(snapshot)
      .filter(([, state]) => state.page >= 0 && !state.isInitialLoad)
      .map(([listId]) => listId);

    if (loadedListIds.length === 0) return;

    const revalidateList = async (listId: string) => {
      const currentState = paginationRef.current[listId];
      if (!currentState || currentState.isLoading) return;

      const targetPage = Math.max(0, currentState.page);
      const pageIndices = Array.from(
        { length: targetPage + 1 },
        (_, index) => index
      );

      const pageResults = await Promise.all(
        pageIndices.map((page) =>
          listWorkspaceTasks(wsId, {
            listId,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          })
        )
      );

      const mergedListTasks = pageResults.flatMap(
        (result) => result.tasks ?? []
      );
      const hasMore =
        (pageResults[pageResults.length - 1]?.tasks?.length ?? 0) === PAGE_SIZE;
      const totalCount = mergedListTasks.length + (hasMore ? 1 : 0);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          const existing = old ?? [];
          const withoutTargetList = existing.filter(
            (task) => task.list_id !== listId
          );
          return [...withoutTargetList, ...mergedListTasks];
        }
      );

      setPagination((prev) => ({
        ...prev,
        [listId]: {
          ...(prev[listId] ?? {
            page: targetPage,
            hasMore: true,
            totalCount: 0,
            isLoading: false,
            isInitialLoad: false,
          }),
          page: targetPage,
          hasMore,
          totalCount,
          isLoading: false,
          isInitialLoad: false,
        },
      }));
    };

    for (
      let i = 0;
      i < loadedListIds.length;
      i += REVALIDATE_LIST_CONCURRENCY
    ) {
      const chunk = loadedListIds.slice(i, i + REVALIDATE_LIST_CONCURRENCY);
      await Promise.all(chunk.map((listId) => revalidateList(listId)));
    }
  }, [boardId, queryClient, wsId]);

  return useMemo(
    () => ({ pagination, loadListPage, revalidateLoadedLists }),
    [pagination, loadListPage, revalidateLoadedLists]
  );
}
