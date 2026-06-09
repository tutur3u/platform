import { useQuery } from '@tanstack/react-query';
import {
  searchWorkspaceTasks,
  type WorkspaceTaskSearchResult,
} from '@tuturuuu/internal-api/tasks';

type SemanticSearchResult = WorkspaceTaskSearchResult;

interface UseSemanticTaskSearchOptions {
  wsId: string;
  query: string;
  matchThreshold?: number;
  matchCount?: number;
  enabled?: boolean;
}

/**
 * Hook to perform semantic search on tasks using Google Gemini embeddings
 * @param options Search options including workspace ID and query
 * @returns Query result with matching tasks
 */
export function useSemanticTaskSearch({
  wsId,
  query,
  matchThreshold = 0.3,
  matchCount = 50,
  enabled = true,
}: UseSemanticTaskSearchOptions) {
  return useQuery({
    queryKey: ['semantic-task-search', wsId, query, matchThreshold, matchCount],
    queryFn: async () => {
      // Only search if query is not empty
      if (!query || query.trim().length === 0) {
        return [];
      }

      try {
        const data = await searchWorkspaceTasks(wsId, {
          query: query.trim(),
          matchThreshold,
          matchCount,
        });
        return (data.tasks || []) as SemanticSearchResult[];
      } catch (error) {
        console.error('Error performing semantic search:', error);
        return [];
      }
    },
    enabled: enabled && !!query && query.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });
}
