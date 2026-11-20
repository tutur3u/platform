import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

import {
  MEET_BASE_PATH,
  MEET_CANONICAL_ORIGIN,
  MEET_LEGACY_ORIGIN,
  meetPublicUrl,
} from '@tuturuuu/utils/meet-url';

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
    if (url.username || url.password) return null;
    if (url.origin === MEET_LEGACY_ORIGIN)
      return new URL(meetPublicUrl(`${url.pathname}${url.search}${url.hash}`))
        .href;
    if (
      url.origin === MEET_CANONICAL_ORIGIN &&
      (url.pathname === MEET_BASE_PATH ||
        url.pathname.startsWith(`${MEET_BASE_PATH}/`))
    )
      return url.href;
    const isMeetHost =
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
