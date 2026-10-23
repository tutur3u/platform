import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import {
  allDayEventCivilDates,
  isAllDayEvent,
} from '@tuturuuu/utils/calendar-utils';
import { calendarDayBoundary } from '../../../../lib/calendar-day';

// Fade over an opaque fill, never through it: the grid beneath stays occluded.
const PAST_EVENT_TREATMENT =
  'isolate overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:bg-background/50 after:transition-opacity after:duration-200 hover:after:opacity-0 focus-visible:after:opacity-0';

export function calendarEventDisplayEnd(
  event: CalendarEvent,
  zone?: string
): number {
  const civil = isAllDayEvent(event, zone)
    ? allDayEventCivilDates(event, zone)
    : null;
  return civil
    ? calendarDayBoundary(civil.end, zone).getTime()
    : Date.parse(event.end_at);
}

export function pastEventTreatment(
  event: CalendarEvent,
  preserve = false,
  interacting = false,
  now = Date.now(),
  displayEndAt = Date.parse(event.end_at)
): string | undefined {
  const status = (event as CalendarEvent & { _optimisticStatus?: string })
    ._optimisticStatus;
  if (
    preserve ||
    interacting ||
    event._isPreview ||
    status ||
    !(displayEndAt <= now)
  )
    return undefined;
  return PAST_EVENT_TREATMENT;
}
