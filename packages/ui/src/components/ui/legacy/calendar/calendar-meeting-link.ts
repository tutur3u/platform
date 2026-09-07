import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

type CalendarEventWithScheduling = Partial<CalendarEvent> & {
  scheduling_metadata?: Record<string, unknown> | null;
};

export function getCalendarMeetingMetadata(event: Partial<CalendarEvent>) {
  return (event as CalendarEventWithScheduling).scheduling_metadata;
}

export function getCalendarMeetingUrl(event: CalendarEventWithScheduling) {
  const metadata = getCalendarMeetingMetadata(event);
  if (
    metadata?.type !== 'tuturuuu_meeting' ||
    typeof metadata.meeting_url !== 'string'
  ) {
    return null;
  }

  try {
    const url = new URL(metadata.meeting_url);
    const isMeetHost =
      url.hostname === 'meet.tuturuuu.com' ||
      url.hostname === 'meet.tuturuuu.localhost' ||
      (url.hostname === 'localhost' && url.port === '7807');
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? isMeetHost
        ? url.toString()
        : null
      : null;
  } catch {
    return null;
  }
}
