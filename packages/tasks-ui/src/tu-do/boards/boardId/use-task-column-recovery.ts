import { useQuery } from '@tanstack/react-query';
import type { ListPaginationState } from '../../shared/progressive-loader-context';

/** Repair an incomplete first page even when a few cached cards remain. */
export function useTaskColumnRecovery({
  boardId,
  listId,
  taskCount,
  listState,
  enabled,
  loadColumnPage,
}: {
  boardId: string;
  listId: string;
  taskCount: number;
  listState?: ListPaginationState;
  enabled: boolean;
  loadColumnPage: (page: number) => Promise<unknown>;
}) {
  // Counts can include external tasks omitted from this response. Prefer the
  // number actually loaded; only complete legacy snapshots imply membership.
  const expectedCount =
    listState?.firstPageTaskCount ??
    (listState?.hasMore ? 0 : Math.min(listState?.totalCount ?? 0, 50));
  useQuery({
    queryKey: [
      'task-column-recovery',
      boardId,
      listId,
      taskCount,
      expectedCount,
    ],
    queryFn: async () => {
      await loadColumnPage(0);
      return true;
    },
    enabled:
      enabled &&
      Boolean(
        listState &&
          !listState.isLoading &&
          !listState.isInitialLoad &&
          ((taskCount === 0 &&
            listState.totalCount > 0 &&
            listState.firstPageTaskCount === undefined) ||
            taskCount < expectedCount)
      ),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
