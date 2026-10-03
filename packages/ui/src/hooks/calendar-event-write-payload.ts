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
