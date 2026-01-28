'use client';

import { useQuery } from '@tanstack/react-query';
import type { TunaCalendarResponse } from '../types/tuna';

// Query keys for calendar
export const tunaCalendarKeys = {
  all: ['tuna', 'calendar'] as const,
  list: (wsId: string) => [...tunaCalendarKeys.all, 'list', { wsId }] as const,
};

// Fetch calendar events
async function fetchTunaCalendar(wsId: string): Promise<TunaCalendarResponse> {
  const params = new URLSearchParams();
  params.set('wsId', wsId);

  const res = await fetch(`/api/v1/tuna/calendar?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch calendar events');
  }
  return res.json();
}

interface UseTunaCalendarParams {
  wsId: string;
}

/**
 * Hook for fetching user's upcoming calendar events for the Tuna panel
 */
export function useTunaCalendar({ wsId }: UseTunaCalendarParams) {
  return useQuery({
    queryKey: tunaCalendarKeys.list(wsId),
    queryFn: () => fetchTunaCalendar(wsId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
