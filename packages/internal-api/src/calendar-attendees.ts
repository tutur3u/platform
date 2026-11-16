import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export type CalendarAttendeeSnapshot = {
  eventId: string;
  provider: 'google' | 'microsoft';
  connectionId: string;
  calendarId: string;
  revision: string;
  attendeeEditing: false;
  attendees: {
    email: string;
    name?: string;
    response?: string;
    resource: boolean;
    optional: boolean;
  }[];
};

export function getCalendarAttendees(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarAttendeeSnapshot>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(eventId)}/attendees`,
    { cache: 'no-store' }
  );
}
