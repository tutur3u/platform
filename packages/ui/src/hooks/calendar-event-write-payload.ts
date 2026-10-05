import type { WorkspaceCalendarEventUpdatePayload } from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export function calendarEventUpdatePayload(
  input: Partial<CalendarEvent>
): WorkspaceCalendarEventUpdatePayload {
  const payload: WorkspaceCalendarEventUpdatePayload = {};
  for (const field of [
    'title',
    'description',
    'location',
    'start_at',
    'end_at',
    'locked',
    'source',
    'providerColor',
  ] as const) {
    if (input[field] !== undefined)
      Object.assign(payload, { [field]: input[field] });
  }
  if (!input.providerColor && input.color !== undefined)
    payload.color = input.color;
  return payload;
}

export function cleanCalendarEventUpdates(input: Partial<CalendarEvent>) {
  const result: Partial<CalendarEvent> = {};
  for (const field of [
    'title',
    'description',
    'start_at',
    'end_at',
    'color',
    'location',
    'locked',
    'source',
  ] as const) {
    if (input[field] !== undefined)
      Object.assign(result, { [field]: input[field] });
  }
  return result;
}
export function calendarEventByIdentity(events: CalendarEvent[], id: string) {
  return events.find((event) => event.id === id || event._originalId === id);
}
export function assertOrdinaryCalendarEvent(
  events: CalendarEvent[],
  id: string
) {
  if (calendarEventByIdentity(events, id)?.seriesId)
    throw new Error(
      'Recurring occurrences require an explicit series edit scope'
    );
}
