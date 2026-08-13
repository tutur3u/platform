'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import type { SessionWithRelations } from '../types/time-tracker';

export const ACTIVE_TIMER_RUNNING_FALLBACK_INTERVAL_MS = 60_000;
export const ACTIVE_TIMER_IDLE_FALLBACK_INTERVAL_MS = 5 * 60_000;
export const ACTIVE_TIMER_STALE_TIME_MS = 30_000;

export function activeTimerSessionQueryOptions(wsId: string | null) {
  return queryOptions({
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
    refetchOnWindowFocus: true,
    staleTime: ACTIVE_TIMER_STALE_TIME_MS,
  });
}

export function useActiveTimerSession(wsId: string | null) {
  return useQuery({
    ...activeTimerSessionQueryOptions(wsId),
    // Mutations invalidate this query immediately, while the elapsed timer ticks
    // locally. Poll only as a cross-device/disconnected-realtime safety net.
    refetchInterval: (query) => {
      const hasRunningSession = query.state.data;
      return hasRunningSession
        ? ACTIVE_TIMER_RUNNING_FALLBACK_INTERVAL_MS
        : ACTIVE_TIMER_IDLE_FALLBACK_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
