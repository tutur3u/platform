import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

export interface TaskSearchResult {
  id: string;
  name: string;
  description?: string;
  board_name?: string;
  list_name?: string;
  list_status?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low' | null;
  completed: boolean;
  start_date?: string;
  end_date?: string;
  assignees?: {
    id: string;
    display_name?: string;
    avatar_url?: string;
  }[];
  is_assigned_to_current_user?: boolean;
}

/**
 * Validates if a string is a valid UUID
 */
function isValidUUID(str: string | null): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Debounce hook to delay search queries
 */
function useDebounced<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for searching tasks in the workspace
 */
export function useTaskSearch(wsId: string | null, query: string, enabled: boolean) {
  const debouncedQuery = useDebounced(query.trim(), 300);
  const hasQuery = debouncedQuery.length > 0;

  // Only enable queries if wsId is a valid UUID (not legacy identifiers like "internal" or "personal")
  const isValidWorkspace = isValidUUID(wsId);

  // Fetch recent/all tasks when no query
  const recentTasksQuery = useQuery({
    queryKey: ['command-palette-recent-tasks', wsId],
    queryFn: async () => {
      if (!wsId) return [];

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=20`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch recent tasks');
      }

      const data = await response.json();
      return (data.tasks || []) as TaskSearchResult[];
    },
    enabled: enabled && !hasQuery && isValidWorkspace,
    staleTime: 30000, // 30 seconds
  });

  // Semantic search when query exists
  const searchTasksQuery = useQuery({
    queryKey: ['command-palette-search-tasks', wsId, debouncedQuery],
    queryFn: async () => {
      if (!wsId || !debouncedQuery) return [];

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: debouncedQuery,
            matchCount: 20,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search tasks');
      }

      const data = await response.json();
      return (data.tasks || data.results || []) as TaskSearchResult[];
    },
    enabled: enabled && hasQuery && isValidWorkspace,
    staleTime: 30000, // 30 seconds
  });

  // Return appropriate query based on whether there's a search query
  if (hasQuery) {
    return {
      tasks: searchTasksQuery.data || [],
      isLoading: searchTasksQuery.isLoading,
      error: searchTasksQuery.error,
    };
  }

  return {
    tasks: recentTasksQuery.data || [],
    isLoading: recentTasksQuery.isLoading,
    error: recentTasksQuery.error,
  };
}
