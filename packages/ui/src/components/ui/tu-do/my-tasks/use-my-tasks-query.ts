'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type { TaskWithRelations } from '@tuturuuu/types';

export interface MyTasksData {
  overdue: TaskWithRelations[];
  today: TaskWithRelations[];
  upcoming: TaskWithRelations[];
  completed: TaskWithRelations[];
  totalActiveTasks: number;
  totalCompletedTasks: number;
  hasMoreCompleted: boolean;
  completedPage: number;
}

/** Filter parameters that get sent to the server-side RPC */
export interface TaskFilterParams {
  workspaceIds: string[];
  boardIds: string[];
  labelIds: string[];
  projectIds: string[];
  selfManagedOnly: boolean;
}

export const MY_TASKS_QUERY_KEY = 'my-tasks';
export const MY_COMPLETED_TASKS_QUERY_KEY = 'my-completed-tasks';

export function useMyTasksQuery(
  wsId: string,
  isPersonal: boolean,
  filters?: TaskFilterParams
) {
  return useQuery<MyTasksData>({
    queryKey: [MY_TASKS_QUERY_KEY, wsId, isPersonal, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        wsId,
        isPersonal: String(isPersonal),
      });

      // Append filter params (skip 'all' sentinel and empty arrays)
      if (filters) {
        for (const id of filters.workspaceIds) {
          if (id !== 'all') params.append('filterWsId', id);
        }
        for (const id of filters.boardIds) {
          if (id !== 'all') params.append('filterBoardId', id);
        }
        for (const id of filters.labelIds) {
          params.append('filterLabelId', id);
        }
        for (const id of filters.projectIds) {
          params.append('filterProjectId', id);
        }
        if (filters.selfManagedOnly) {
          params.set('selfManagedOnly', 'true');
        }
      }

      const res = await fetch(`/api/v1/users/me/tasks?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}

export interface CompletedTasksPage {
  completed: TaskWithRelations[];
  hasMoreCompleted: boolean;
  completedPage: number;
  totalCompletedTasks: number;
}

export function useCompletedTasksQuery(
  wsId: string,
  isPersonal: boolean,
  filters?: TaskFilterParams
) {
  return useInfiniteQuery<CompletedTasksPage>({
    queryKey: [MY_COMPLETED_TASKS_QUERY_KEY, wsId, isPersonal, filters],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        wsId,
        isPersonal: String(isPersonal),
        completedPage: String(pageParam),
        completedLimit: '20',
      });

      // Append filter params (same logic as useMyTasksQuery)
      if (filters) {
        for (const id of filters.workspaceIds) {
          if (id !== 'all') params.append('filterWsId', id);
        }
        for (const id of filters.boardIds) {
          if (id !== 'all') params.append('filterBoardId', id);
        }
        for (const id of filters.labelIds) {
          params.append('filterLabelId', id);
        }
        for (const id of filters.projectIds) {
          params.append('filterProjectId', id);
        }
        if (filters.selfManagedOnly) {
          params.set('selfManagedOnly', 'true');
        }
      }

      const res = await fetch(`/api/v1/users/me/tasks?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch completed tasks');
      }
      const data = await res.json();
      return {
        completed: data.completed ?? [],
        hasMoreCompleted: data.hasMoreCompleted ?? false,
        completedPage: data.completedPage ?? 0,
        totalCompletedTasks: data.totalCompletedTasks ?? 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMoreCompleted ? lastPage.completedPage + 1 : undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
