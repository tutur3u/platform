import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

/** Provider meetings are fixed commitments, even when their local copy is unlocked. */
export function calendarPreviewBlockedEvents(
  events: CalendarEvent[],
  now: Date,
  habitEventIds: Set<string>
) {
  return events
    .filter((event) => {
      if (event._isPreview) return false;
      if (
        event.locked ||
        event.provider === 'google' ||
        event.provider === 'microsoft'
      )
        return true;
      if (
        event.source?.provider === 'google' ||
        event.source?.provider === 'microsoft' ||
        event.google_event_id ||
        event.external_event_id
      )
        return true;
      return new Date(event.start_at) < now || habitEventIds.has(event.id);
    })
    .map(({ id, start_at, end_at }) => ({ id, start_at, end_at }));
}
