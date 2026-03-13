'use client';

import { useQueryClient } from '@tanstack/react-query';
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
        const searchParams = new URLSearchParams({
          listId,
          limit: PAGE_SIZE.toString(),
          offset: String(page * PAGE_SIZE),
        });

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/tasks?${searchParams.toString()}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          if (response.status === 404) {
            const emptyResult = {
              tasks: [] as Task[],
              hasMore: false,
              totalCount: 0,
            };

            setPagination((prev) => ({
              ...prev,
              [listId]: {
                page,
                hasMore: false,
                totalCount: 0,
                isLoading: false,
                isInitialLoad: false,
              },
            }));

            return emptyResult;
          }

          const errorBody = await response.json().catch(() => null);
          throw new Error(
            errorBody?.error ||
              `Failed to fetch list tasks (${response.status})`
          );
        }

        const payload = (await response.json()) as { tasks?: Task[] };
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
            const existingIds = new Set(existing.map((t) => t.id));
            const newTasks = result.tasks.filter((t) => !existingIds.has(t.id));
            return [...existing, ...newTasks];
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
