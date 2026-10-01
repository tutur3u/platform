import type { calendar_v3 } from '@tuturuuu/google';

/**
 * Filters events by date range and status using a pipe pattern
 */
export function filterEventsByStatus(events: calendar_v3.Schema$Event[]) {
  const result = events.reduce(
    (acc, event) => {
      // Filter by status
      if (event.status === 'cancelled') {
        acc.eventsToDelete.push(event);
      } else {
        acc.eventsToUpsert.push(event);
      }
      return acc;
    },
    {
      eventsToUpsert: [] as calendar_v3.Schema$Event[],
      eventsToDelete: [] as calendar_v3.Schema$Event[],
    }
  );

  console.debug('✅ [DEBUG] filterEventsByStatus completed:', {
    originalEventsCount: events.length,
    eventsToUpsertCount: result.eventsToUpsert.length,
    eventsToDeleteCount: result.eventsToDelete.length,
  });

  return result;
}

export function getCancelledGoogleEventIds(events: calendar_v3.Schema$Event[]) {
  return [
    ...new Set(
      events
        .filter((event) => event.status === 'cancelled')
        .map((event) => event.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}
