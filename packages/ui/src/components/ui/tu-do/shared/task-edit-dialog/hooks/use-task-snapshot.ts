'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  SnapshotAssignee,
  SnapshotLabel,
  SnapshotProject,
  TaskSnapshot,
} from '@tuturuuu/utils/task-snapshot';

// Re-export types for convenience
export type { SnapshotAssignee, SnapshotLabel, SnapshotProject, TaskSnapshot };

export interface TaskSnapshotResponse {
  snapshot: TaskSnapshot;
  historyEntry: {
    id: string;
    changed_at: string;
    change_type: string;
    field_name: string | null;
  } | null;
}

interface UseTaskSnapshotProps {
  wsId: string;
  taskId: string;
  historyId: string | null;
  enabled?: boolean;
}

/**
 * Hook to fetch a task snapshot at a specific history point
 */
export function useTaskSnapshot({
  wsId,
  taskId,
  historyId,
  enabled = true,
}: UseTaskSnapshotProps) {
  return useQuery({
    queryKey: ['task-snapshot', wsId, taskId, historyId],
    queryFn: async (): Promise<TaskSnapshotResponse> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/snapshot/${historyId}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch snapshot');
      }

      return response.json();
    },
    enabled: enabled && !!historyId && !!taskId && !!wsId,
    staleTime: 60 * 1000, // Cache for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}
