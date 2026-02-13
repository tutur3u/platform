'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

export const MY_TASKS_QUERY_KEY = 'my-tasks';
export const MY_COMPLETED_TASKS_QUERY_KEY = 'my-completed-tasks';

export function useMyTasksQuery(wsId: string, isPersonal: boolean) {
  return useQuery<MyTasksData>({
    queryKey: [MY_TASKS_QUERY_KEY, wsId, isPersonal],
    queryFn: async () => {
      const params = new URLSearchParams({
        wsId,
        isPersonal: String(isPersonal),
      });
      const res = await fetch(`/api/v1/users/me/tasks?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface CompletedTasksPage {
  completed: TaskWithRelations[];
  hasMoreCompleted: boolean;
  completedPage: number;
  totalCompletedTasks: number;
}

export function useCompletedTasksQuery(wsId: string, isPersonal: boolean) {
  return useInfiniteQuery<CompletedTasksPage>({
    queryKey: [MY_COMPLETED_TASKS_QUERY_KEY, wsId, isPersonal],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        wsId,
        isPersonal: String(isPersonal),
        completedPage: String(pageParam),
        completedLimit: '20',
      });
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
