'use client';

import { useQueryClient } from '@tanstack/react-query';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ListPaginationState,
  ProgressiveLoaderValue,
  ProgressiveLoadListPageOptions,
} from './progressive-loader-context';

const PAGE_SIZE = 50;
const LOCAL_MUTATION_MARKER_TTL_MS = 30_000;
const REVALIDATE_LIST_CONCURRENCY = 2;

function hasFreshLocalMutation(task: Task) {
  const localTask = task as Task & { _localMutationAt?: number };
  const localMutationAt = localTask._localMutationAt;

  return (
    typeof localMutationAt === 'number' &&
    Date.now() - localMutationAt < LOCAL_MUTATION_MARKER_TTL_MS
  );
}

function hasLocallyProtectedMoveDifference(task: Task, incomingTask: Task) {
  const current = task as Task & { completed?: boolean | null };
  const incoming = incomingTask as Task & { completed?: boolean | null };

  return (
    current.list_id !== incoming.list_id ||
    current.sort_key !== incoming.sort_key ||
    current.personal_list_id !== incoming.personal_list_id ||
    current.personal_sort_key !== incoming.personal_sort_key ||
    current.completed !== incoming.completed ||
    current.completed_at !== incoming.completed_at ||
    current.closed_at !== incoming.closed_at
  );
}

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
  const listOptionsRef = useRef<Record<string, ProgressiveLoadListPageOptions>>(
    {}
  );

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const loadListPage = useCallback(
    async (
      listId: string,
      page: number = 0,
      options?: ProgressiveLoadListPageOptions
    ) => {
      listOptionsRef.current[listId] = options ?? {};

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
        const payload = await listWorkspaceTasks(wsId, {
          boardId,
          listId,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          includeCount: true,
          ...options,
          includeRelationshipSummary: false,
        });
        const tasks = payload.tasks ?? [];
        const loadedThrough = page * PAGE_SIZE + tasks.length;
        const totalCount =
          typeof payload.count === 'number'
            ? Math.max(payload.count, loadedThrough)
            : loadedThrough + (tasks.length === PAGE_SIZE ? 1 : 0);
        const hasMore =
          typeof payload.count === 'number'
            ? loadedThrough < payload.count
            : tasks.length === PAGE_SIZE;
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
              // that was moved or reordered locally while the server response
              // is catching up.
              if (
                hasFreshLocalMutation(task) &&
                hasLocallyProtectedMoveDifference(task, incomingTask)
              ) {
                return task;
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
            boardId,
            listId,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            includeCount: true,
            ...listOptionsRef.current[listId],
            includeRelationshipSummary: false,
          })
        )
      );

      const mergedListTasks = pageResults.flatMap(
        (result) => result.tasks ?? []
      );
      const lastPageTasks = pageResults[pageResults.length - 1]?.tasks ?? [];
      const exactCount = pageResults.find(
        (result) => typeof result.count === 'number'
      )?.count;
      const loadedThrough = targetPage * PAGE_SIZE + lastPageTasks.length;
      const totalCount =
        typeof exactCount === 'number'
          ? Math.max(exactCount, loadedThrough)
          : mergedListTasks.length +
            (lastPageTasks.length === PAGE_SIZE ? 1 : 0);
      const hasMore =
        typeof exactCount === 'number'
          ? loadedThrough < exactCount
          : lastPageTasks.length === PAGE_SIZE;

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          const existing = old ?? [];
          const incomingById = new Map(
            mergedListTasks.map((task) => [task.id, task] as const)
          );

          const merged: Task[] = [];

          for (const task of existing) {
            const incomingTask = incomingById.get(task.id);
            if (incomingTask) {
              incomingById.delete(task.id);

              if (
                hasFreshLocalMutation(task) &&
                hasLocallyProtectedMoveDifference(task, incomingTask)
              ) {
                merged.push(task);
                continue;
              }

              const sanitizedTask = {
                ...(task as Task & { _localMutationAt?: number }),
              };
              delete sanitizedTask._localMutationAt;

              merged.push({ ...sanitizedTask, ...incomingTask });
              continue;
            }

            if (task.list_id !== listId) {
              merged.push(task);
              continue;
            }

            if (hasFreshLocalMutation(task)) {
              merged.push(task);
            }
          }

          return [...merged, ...incomingById.values()];
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
