import { useQuery } from '@tanstack/react-query';
import { TASKS_LIMIT } from '@/constants/common';

export function useTasksData(wsId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', wsId, TASKS_LIMIT],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=${TASKS_LIMIT}`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled,
    staleTime: 30000, // Cache for 30 seconds
  });
} 