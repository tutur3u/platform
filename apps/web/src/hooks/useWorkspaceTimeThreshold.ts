import { useQuery } from '@tanstack/react-query';

export function useWorkspaceTimeThreshold(wsId: string | null) {
  return useQuery({
    queryKey: ['workspace-time-threshold', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('Workspace ID is required');
      const res = await fetch(`/api/v1/workspaces/${wsId}/settings`);
      if (!res.ok) throw new Error('Failed to fetch workspace threshold');
      const data = await res.json();
      const threshold = data?.missed_entry_date_threshold;
      return (typeof threshold === 'number' ? threshold : 1) as number;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

