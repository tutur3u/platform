import { useQuery } from '@tanstack/react-query';

interface SemanticSearchResult {
  id: string;
  name: string;
  description: string | null;
  list_id: string;
  start_date: string | null;
  end_date: string | null;
  completed: boolean;
  archived: boolean;
  similarity: number;
}

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
        // Call the API endpoint to perform semantic search
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/tasks/search`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: query.trim(),
              matchThreshold,
              matchCount,
            }),
          }
        );

        if (!response.ok) {
          console.error('Semantic search failed:', await response.text());
          return [];
        }

        const data = await response.json();
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
