import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch workspace time tracking threshold setting.
 *
 * Returns:
 * - threshold:
 *   - null: No approval needed (any entry can be added directly)
 *   - 0: All entries require approval
 *   - number > 0: Entries older than this many days require approval
 */
export function useWorkspaceTimeThreshold(wsId: string | null) {
  return useQuery({
    queryKey: ['workspace-time-threshold', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('Workspace ID is required');
      const res = await fetch(`/api/v1/workspaces/${wsId}/settings`);
      if (!res.ok) throw new Error('Failed to fetch workspace threshold');
      const data = await res.json();
      const threshold = data?.missed_entry_date_threshold;

      return {
        threshold: typeof threshold === 'number' ? threshold : null,
      };
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
