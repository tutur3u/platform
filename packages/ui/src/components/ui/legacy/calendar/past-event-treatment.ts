import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { readGoogleEventColor } from '@tuturuuu/utils/google-calendar-colors';

// Fade over an opaque fill, never through it: the grid beneath stays occluded.
const PAST_EVENT_TREATMENT =
  'isolate overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-30 after:bg-background/50 after:transition-opacity after:duration-200 hover:after:opacity-0 focus-visible:after:opacity-0';

export function pastEventTreatment(
  event: CalendarEvent,
  preserve = false,
  interacting = false,
  now = Date.now()
): string | undefined {
  const provider = event.source?.provider ?? event.provider;
  const status = (event as CalendarEvent & { _optimisticStatus?: string })
    ._optimisticStatus;
  if (
    preserve ||
    interacting ||
    event._isPreview ||
    status ||
    (provider && provider !== 'tuturuuu') ||
    (!provider &&
      (event.google_calendar_id ||
        event.google_event_id ||
        readGoogleEventColor(event.scheduling_metadata))) ||
    !(Date.parse(event.end_at) < now)
  )
    return undefined;
  return PAST_EVENT_TREATMENT;
}
