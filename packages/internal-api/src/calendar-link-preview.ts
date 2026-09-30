import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

/** Provider-supplied recurrence identity; null means unavailable, never guessed. */
export interface CalendarOccurrenceIdentity {
  value: string;
  valueType: 'DATE' | 'DATE-TIME';
  tzid: string | null;
}

export interface CalendarEventIdentity {
  workspaceId: string;
  eventId: string;
  provider: 'tuturuuu' | 'google' | 'microsoft';
  actorUserId: string;
  /** Stable nonsecret calendar_auth_tokens row ID, not an OAuth token or actor ID. */
  accountOwnerId: string | null;
  accountEmail: string | null;
  connectionId: string | null;
  /** Provider external calendar ID; native workspace calendar ID for Tuturuuu. */
  calendarId: string | null;
  sourceCalendarId: string | null;
  externalCalendarId: string | null;
  externalEventId: string | null;
  iCalUid: string | null;
  occurrence: CalendarOccurrenceIdentity | null;
}

export interface CalendarPreviewPerson {
  email: string | null;
  name: string | null;
  responseStatus?: string | null;
  self?: boolean;
}

export interface CalendarEventLinkPreview {
  identity: CalendarEventIdentity;
  revision: string | null;
  etag: string | null;
  title: string | null;
  organizer: CalendarPreviewPerson | null;
  attendees: CalendarPreviewPerson[];
  attendeesRestricted: boolean;
  location: {
    displayName: string | null;
    address: {
      street: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      countryOrRegion: string | null;
    } | null;
  } | null;
  joinUrl: string | null;
  start: CalendarOccurrenceIdentity | null;
  end: CalendarOccurrenceIdentity | null;
  timeZone: string | null;
  recurrence: {
    kind: 'single' | 'series' | 'occurrence' | 'unknown';
    seriesEventId: string | null;
  };
  accessRole: string | null;
  accountLabel: string | null;
}

export async function getCalendarEventLinkPreview(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarEventLinkPreview>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(eventId)}/link-preview`,
    { cache: 'no-store' }
  );
}
