import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export type CalendarGuestRsvpStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'tentative';

export type CalendarEventGuest = {
  id: string;
  email: string;
  displayName: string | null;
  userId: string | null;
  contactId: string | null;
  source: 'member' | 'contact' | 'email';
  isOrganizer: boolean;
  isOptional: boolean;
  rsvpStatus: CalendarGuestRsvpStatus;
  respondedAt: string | null;
  invited: boolean;
};

export type CalendarGuestSettings = {
  guestsCanModify: boolean;
  guestsCanInviteOthers: boolean;
  guestsCanSeeGuestList: boolean;
  meetMeetingId: string | null;
  conferenceUrl: string | null;
  cancelled: boolean;
};

export type CalendarEventLinks = {
  meeting: { id: string; url: string } | null;
  task: { id: string; name: string } | null;
};

export type CalendarEventGuestsResponse = {
  native: boolean;
  links: CalendarEventLinks;
  settings: CalendarGuestSettings | null;
  guests: CalendarEventGuest[];
};

export type CalendarGuestInput =
  | { source: 'member'; userId: string; optional?: boolean }
  | { source: 'contact'; contactId: string; optional?: boolean }
  | { source: 'email'; email: string; name?: string; optional?: boolean };

export type CalendarGuestDisplay = { allDay?: boolean; timeZone?: string };

export type CalendarInvitationDeliverySummary = {
  queued: number;
  suppressed: number;
  throttled: number;
  duplicates: number;
} | null;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function guestsPath(wsId: string, eventId: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(eventId)}/guests`;
}

export function getCalendarEventGuests(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarEventGuestsResponse>(
    guestsPath(wsId, eventId),
    { cache: 'no-store' }
  );
}

export function addCalendarEventGuests(
  wsId: string,
  eventId: string,
  payload: {
    guests: CalendarGuestInput[];
    notify?: boolean;
    display?: CalendarGuestDisplay;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    added: number;
    delivery: CalendarInvitationDeliverySummary;
  }>(guestsPath(wsId, eventId), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export function updateCalendarGuestSettings(
  wsId: string,
  eventId: string,
  patch: Partial<
    Pick<
      CalendarGuestSettings,
      'guestsCanModify' | 'guestsCanInviteOthers' | 'guestsCanSeeGuestList'
    >
  >,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    Pick<
      CalendarGuestSettings,
      'guestsCanModify' | 'guestsCanInviteOthers' | 'guestsCanSeeGuestList'
    >
  >(guestsPath(wsId, eventId), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
}

export function updateCalendarEventGuest(
  wsId: string,
  eventId: string,
  guestId: string,
  patch: { optional: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    id: string;
    isOptional: boolean;
  }>(`${guestsPath(wsId, eventId)}/${encodePathSegment(guestId)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
}

export async function removeCalendarEventGuest(
  wsId: string,
  eventId: string,
  guestId: string,
  input: { notify?: boolean } = {},
  options?: InternalApiClientOptions
) {
  const response = await getInternalApiClient(options).fetch(
    `${guestsPath(wsId, eventId)}/${encodePathSegment(guestId)}`,
    {
      method: 'DELETE',
      query: input.notify === false ? { notify: 'false' } : undefined,
      cache: 'no-store',
    }
  );
  if (!response.ok)
    throw new Error(`Failed to remove guest: ${response.status}`);
}

export function notifyCalendarEventGuests(
  wsId: string,
  eventId: string,
  payload: { kind: 'update' | 'cancel'; display?: CalendarGuestDisplay },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    delivery: CalendarInvitationDeliverySummary;
  }>(`${guestsPath(wsId, eventId)}/notify`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export function linkCalendarEventMeeting(
  wsId: string,
  eventId: string,
  payload: { meetingId?: string } = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    meetingId: string;
    url: string;
    created: boolean;
  }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(eventId)}/meet`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function unlinkCalendarEventMeeting(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  const response = await getInternalApiClient(options).fetch(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(eventId)}/meet`,
    { method: 'DELETE', cache: 'no-store' }
  );
  if (!response.ok)
    throw new Error(`Failed to remove the meeting link: ${response.status}`);
}
