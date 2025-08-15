'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import { useCallback, useEffect, useState } from 'react';

interface UseScheduledEventsProps {
  wsId: string;
  userId: string;
}

interface UseScheduledEventsReturn {
  events: WorkspaceScheduledEventWithAttendees[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateAttendeeStatus: (
    eventId: string,
    status: 'accepted' | 'declined' | 'tentative'
  ) => Promise<void>;
}

export const useScheduledEvents = ({
  wsId,
  userId,
}: UseScheduledEventsProps): UseScheduledEventsReturn => {
  const [events, setEvents] = useState<WorkspaceScheduledEventWithAttendees[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('workspace_scheduled_events')
        .select(
          `
          *,
          creator:users!creator_id(id, display_name, avatar_url),
          attendees:event_attendees(
            id,
            user_id,
            status,
            response_at,
            user:users(id, display_name, avatar_url)
          )
        `
        )
        .eq('ws_id', wsId)
        .or(`creator_id.eq.${userId},attendees.user_id.eq.${userId}`)
        .order('start_at', { ascending: true });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      // Calculate attendee counts for each event
      const eventsWithCounts = (data || []).map((event) => ({
        ...event,
        attendee_count: event.attendees?.reduce(
          (counts, attendee) => {
            counts.total++;
            counts[attendee.status as keyof typeof counts]++;
            return counts;
          },
          { total: 0, accepted: 0, declined: 0, pending: 0, tentative: 0 }
        ) || { total: 0, accepted: 0, declined: 0, pending: 0, tentative: 0 },
      }));

      setEvents(eventsWithCounts as WorkspaceScheduledEventWithAttendees[]);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to fetch events')
      );
    } finally {
      setIsLoading(false);
    }
  }, [wsId, userId]);

  const updateAttendeeStatus = useCallback(
    async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
      try {
        const supabase = createClient();

        // Update the attendee status
        const { error: updateError } = await supabase
          .from('event_attendees')
          .update({
            status,
            response_at: new Date().toISOString(),
          })
          .eq('event_id', eventId)
          .eq('user_id', userId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Refresh events to get updated data
        await fetchEvents();
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to update status')
        );
      }
    },
    [userId, fetchEvents]
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    isLoading,
    error,
    refresh: fetchEvents,
    updateAttendeeStatus,
  };
};
