import { useQuery } from '@tanstack/react-query';

interface ThresholdResponse {
  threshold: number;
}

export function useThreshold({ wsId }: { wsId: string }) {
  return useQuery<ThresholdResponse>({
    queryKey: ['workspace', wsId, 'time-tracking', 'threshold'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/threshold`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch threshold');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchOnMount: false, // Don't refetch on component mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });
}
