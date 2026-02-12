'use client';

import { useQuery } from '@tanstack/react-query';
import type { SessionWithRelations } from '../types/time-tracker';

export function useActiveTimerSession(wsId: string | null) {
  return useQuery({
    queryKey: ['running-time-session', wsId],
    queryFn: async () => {
      if (!wsId) return null;

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch running session');
      }
      const data = await response.json();
      return data.session as SessionWithRelations | null;
    },
    enabled: !!wsId,
    // Optimized refetch strategy for sidebar
    refetchInterval: (query) => {
      const hasRunningSession = query.state.data;
      // If there's a running session, refresh every 30 seconds
      // If no running session, refresh every 2 minutes to check for new sessions
      return hasRunningSession ? 30000 : 120000;
    },
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to ensure immediate updates when invalidated
  });
}
