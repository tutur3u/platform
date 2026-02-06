import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch workspace time tracking threshold setting.
 *
 * Returns:
 * - threshold:
 *   - null: No approval needed (any entry can be added directly)
 *   - 0: All entries require approval
 *   - number > 0: Entries older than this many days require approval
 */
export interface UseWorkspaceTimeThresholdOptions {
  /** If false, skip fetching. Default is true. */
  enabled?: boolean;
  /** Custom fetcher function (e.g., for React Native with auth headers) */
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Base URL for API (defaults to empty string for relative URLs) */
  baseUrl?: string;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTimeMs?: number;
}

const normalizeBaseUrl = (baseUrl?: string) =>
  baseUrl ? baseUrl.replace(/\/$/, '') : '';

export function useWorkspaceTimeThreshold(
  wsId: string | null,
  options: UseWorkspaceTimeThresholdOptions = {}
): UseQueryResult<{ threshold: number | null }> {
  const {
    enabled = true,
    fetcher,
    baseUrl,
    staleTimeMs = 5 * 60 * 1000,
  } = options;

  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedFetch = fetcher ?? fetch;

  return useQuery({
    queryKey: ['workspace-time-threshold', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('Workspace ID is required');

      const url = `${resolvedBaseUrl}/api/v1/workspaces/${wsId}/settings`;
      const res = await resolvedFetch(url);

      if (!res.ok) throw new Error('Failed to fetch workspace threshold');
      const data = await res.json();
      const threshold = data?.missed_entry_date_threshold;

      return {
        threshold: typeof threshold === 'number' ? threshold : null,
      };
    },
    enabled: !!wsId && enabled,
    staleTime: staleTimeMs,
  });
}
