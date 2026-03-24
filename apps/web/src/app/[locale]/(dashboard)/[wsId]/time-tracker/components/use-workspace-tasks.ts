'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaceTimeTrackingTasks } from '@tuturuuu/internal-api';
import type { TaskWithDetails } from './session-history/session-types';

interface UseWorkspaceTasksOptions {
  wsId: string | null;
  enabled?: boolean;
}

export function useWorkspaceTasks({
  wsId,
  enabled = true,
}: UseWorkspaceTasksOptions) {
  return useQuery({
    queryKey: ['workspace-tasks', wsId],
    queryFn: async (): Promise<TaskWithDetails[]> => {
      if (!wsId) return [];
      return (await listWorkspaceTimeTrackingTasks(wsId)) as TaskWithDetails[];
    },
    enabled: enabled && !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
