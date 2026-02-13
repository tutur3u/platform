'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { getTasksForList } from '@tuturuuu/utils/task-helper';
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
        const supabase = createClient();
        const result = await getTasksForList(supabase, listId, {
          page,
          limit: PAGE_SIZE,
        });

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
    [boardId, queryClient]
  );

  return useMemo(
    () => ({ pagination, loadListPage }),
    [pagination, loadListPage]
  );
}
