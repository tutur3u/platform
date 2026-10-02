import type {
  CalendarEventIdentity,
  CalendarEventLinkPreview,
  CalendarOccurrenceIdentity,
} from './calendar-link-preview';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withMailApiBaseUrl,
} from './client';
import { jsonHeaders, mailboxPath } from './mail-paths';

export type MailInvitationIdentity = {
  actorId: string;
  mailboxId: string;
  uid: string;
  organizer: string;
  attendee: string;
  occurrence: CalendarOccurrenceIdentity | null;
};
export type CalendarLinkTargetIdentity = CalendarEventIdentity;
export type AuthorizedCalendarLinkTarget = {
  identity: CalendarEventIdentity;
  title: string;
  organizer: string | null;
  attendees: string[];
  location: string;
  joinUrl: string | null;
  start: string;
  end: string;
  accountLabel: string;
  authority: CalendarEventLinkPreview;
  calendarUrl: string | null;
};
export type MailCalendarAssociation = {
  invitation: MailInvitationIdentity;
  sequence: number;
  target: CalendarEventIdentity;
  receipt: string;
  authorityReceipt: string;
};
export type CalendarLinkPreview = {
  invitation: MailInvitationIdentity;
  sequence: number;
  original: {
    summary: string;
    when: string;
    location: string;
    joinUrl: string | null;
  };
  target: AuthorizedCalendarLinkTarget;
  existingTarget: CalendarEventIdentity | null;
  existingReceipt: string;
  authorityReceipt: string;
  receipt: string;
};
export type CalendarLinkResult =
  | { status: 'linked'; association: MailCalendarAssociation }
  | { status: 'unavailable' | 'changed' | 'conflict' };
export type MailCalendarLinkSelection = {
  calendarWorkspaceId: string;
  eventId: string;
};
export type MailCalendarLinkedTarget = {
  target: AuthorizedCalendarLinkTarget | null;
  association: MailCalendarAssociation | null;
};
const path = (wsId: string, boxId: string, messageId: string) =>
  `${mailboxPath(wsId, boxId)}/messages/${encodePathSegment(messageId)}/calendar-link`;
export function getMailCalendarLink(
  wsId: string,
  boxId: string,
  messageId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    withMailApiBaseUrl(options)
  ).json<MailCalendarLinkedTarget>(path(wsId, boxId, messageId), {
    cache: 'no-store',
    credentials: 'include',
  });
}
export function previewMailCalendarLink(
  wsId: string,
  boxId: string,
  messageId: string,
  selection: MailCalendarLinkSelection,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    preview: CalendarLinkPreview | null;
  }>(`${path(wsId, boxId, messageId)}/preview`, {
    method: 'POST',
    body: JSON.stringify(selection),
    headers: jsonHeaders(),
    cache: 'no-store',
    credentials: 'include',
  });
}
export function confirmMailCalendarLink(
  wsId: string,
  boxId: string,
  messageId: string,
  selection: MailCalendarLinkSelection & { receipt: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    withMailApiBaseUrl(options)
  ).json<CalendarLinkResult>(path(wsId, boxId, messageId), {
    method: 'PUT',
    body: JSON.stringify(selection),
    headers: jsonHeaders(),
    cache: 'no-store',
    credentials: 'include',
  });
}
export function unlinkMailCalendarLink(
  wsId: string,
  boxId: string,
  messageId: string,
  receipt: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withMailApiBaseUrl(options)).json<{
    status: 'unlinked' | 'unavailable' | 'changed' | 'conflict';
  }>(path(wsId, boxId, messageId), {
    method: 'DELETE',
    body: JSON.stringify({ receipt }),
    headers: jsonHeaders(),
    cache: 'no-store',
    credentials: 'include',
  });
}

/** Only extracts a reference; authorization is always performed by the server. */
export function parseMailCalendarEventUrl(
  value: string
): MailCalendarLinkSelection | null {
  try {
    const url = new URL(value);
    if (
      !['calendar.tuturuuu.com', 'calendar.tuturuuu.localhost'].includes(
        url.hostname
      ) ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && url.hostname.endsWith('.localhost')))
    )
      return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const calendarWorkspaceId = segments.at(-1);
    const eventId = url.searchParams.get('eventId');
    const guid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !calendarWorkspaceId ||
      !(guid.test(calendarWorkspaceId) || calendarWorkspaceId === 'personal') ||
      !eventId ||
      !guid.test(eventId) ||
      url.searchParams.getAll('eventId').length !== 1 ||
      segments.length > 2
    )
      return null;
    return { calendarWorkspaceId, eventId };
  } catch {
    return null;
  }
}
