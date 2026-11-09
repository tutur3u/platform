'use client';

import { useQuery } from '@tanstack/react-query';
import type { MiraCalendarResponse } from '../types/mira';

// Query keys for calendar
export const miraCalendarKeys = {
  all: ['mira', 'calendar'] as const,
  list: (wsId: string) => [...miraCalendarKeys.all, 'list', { wsId }] as const,
};

// Fetch calendar events
async function fetchMiraCalendar(wsId: string): Promise<MiraCalendarResponse> {
  const params = new URLSearchParams();
  params.set('wsId', wsId);

  const res = await fetch(`/api/v1/mira/calendar?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Failed to fetch calendar events');
  }
  return res.json();
}

interface UseMiraCalendarParams {
  wsId: string;
}

/**
 * Hook for fetching user's upcoming calendar events for the Mira panel
 */
export function useMiraCalendar({ wsId }: UseMiraCalendarParams) {
  return useQuery({
    queryKey: miraCalendarKeys.list(wsId),
    queryFn: () => fetchMiraCalendar(wsId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
