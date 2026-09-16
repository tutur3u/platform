'use client';

import { useQuery } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

/** Subscribe to the board owner's data without supplying another fetcher. */
export function useCachedBoardTasks<T = Task[]>(
  boardId: string,
  select?: (tasks: Task[]) => T
) {
  return useQuery<Task[], Error, T>({
    queryKey: ['tasks', boardId],
    enabled: false,
    select,
  });
}
