'use client';

import { useQueryClient } from '@tanstack/react-query';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useMemo, useState } from 'react';
import type {
  ListPaginationState,
  ProgressiveLoaderValue,
} from './progressive-loader-context';

const PAGE_SIZE = 50;

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
              return { ...task, ...incomingTask };
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

  return useMemo(
    () => ({ pagination, loadListPage }),
    [pagination, loadListPage]
  );
}
