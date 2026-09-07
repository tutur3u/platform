import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export function getCalendarMeetingUrl(event: Partial<CalendarEvent>) {
  const metadata = event.scheduling_metadata;
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
