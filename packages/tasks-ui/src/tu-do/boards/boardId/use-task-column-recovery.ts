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
  useQuery({
    queryKey: [
      'task-column-recovery',
      boardId,
      listId,
      taskCount,
      listState?.totalCount,
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
          taskCount < Math.min(listState.totalCount, 50)
      ),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
