import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

/** Keep only unconfirmed drafts after a batch so retry never resends saved events. */
export async function saveCalendarEventDrafts(
  drafts: Partial<CalendarEvent>[],
  addEvent: (
    event: Omit<CalendarEvent, 'id'>
  ) => Promise<CalendarEvent | undefined>,
  source: CalendarEvent['source']
) {
  const savedEvents: CalendarEvent[] = [];
  const failedEvents: Partial<CalendarEvent>[] = [];
  for (const draft of drafts) {
    try {
      const saved = await addEvent({
        title: draft.title || 'New Event',
        description: draft.description || '',
        start_at: draft.start_at || '',
        end_at: draft.end_at || '',
        color: draft.color || 'BLUE',
        location: draft.location || '',
        locked: draft.locked || false,
        source,
      });
      if (saved?.id) savedEvents.push(saved);
      else failedEvents.push(draft);
    } catch {
      failedEvents.push(draft);
    }
  }
  return { savedEvents, failedEvents };
}
