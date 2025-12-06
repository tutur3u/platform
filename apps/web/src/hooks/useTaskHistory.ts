import { useQuery } from '@tanstack/react-query';

export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  changed_by: string | null;
  changed_at: string;
  change_type:
    | 'field_updated'
    | 'assignee_added'
    | 'assignee_removed'
    | 'label_added'
    | 'label_removed'
    | 'project_linked'
    | 'project_unlinked'
    | 'task_created';
  field_name?: string | null;
  old_value: any;
  new_value: any;
  metadata: Record<string, any>;
  user: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
}

export interface TaskHistoryResponse {
  history: TaskHistoryEntry[];
  count: number;
  limit: number;
  offset: number;
  task: {
    id: string;
    name: string;
  };
}

interface UseTaskHistoryOptions {
  wsId: string;
  taskId: string;
  limit?: number;
  offset?: number;
  change_type?:
    | 'field_updated'
    | 'assignee_added'
    | 'assignee_removed'
    | 'label_added'
    | 'label_removed'
    | 'project_linked'
    | 'project_unlinked';
  field_name?: string;
  enabled?: boolean;
}

/**
 * Hook to fetch task change history
 */
export function useTaskHistory({
  wsId,
  taskId,
  limit = 50,
  offset = 0,
  change_type,
  field_name,
  enabled = true,
}: UseTaskHistoryOptions) {
  return useQuery({
    queryKey: [
      'task-history',
      wsId,
      taskId,
      limit,
      offset,
      change_type,
      field_name,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(change_type && { change_type }),
        ...(field_name && { field_name }),
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/history?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch task history');
      }

      const data = await response.json();
      return data as TaskHistoryResponse;
    },
    enabled: !!wsId && !!taskId && enabled,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch task history with infinite scroll support
 */
export function useTaskHistoryInfinite({
  wsId,
  taskId,
  limit = 20,
  change_type,
  field_name,
}: Omit<UseTaskHistoryOptions, 'offset' | 'enabled'>) {
  return useQuery({
    queryKey: [
      'task-history-infinite',
      wsId,
      taskId,
      limit,
      change_type,
      field_name,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: '0',
        ...(change_type && { change_type }),
        ...(field_name && { field_name }),
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/history?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch task history');
      }

      const data = await response.json();
      return data as TaskHistoryResponse;
    },
    enabled: !!wsId && !!taskId,
    staleTime: 30000,
  });
}
