import { google } from '@tuturuuu/google';
import type { CalendarAttendeeSnapshot } from '@tuturuuu/internal-api/calendar-attendees';
import { z } from 'zod';
import { createGoogleAuthClient } from './provider-writes';
import type { ResolvedCalendarSource } from './source-resolver';

export class AttendeeSnapshotError extends Error {
  constructor(readonly status: number) {
    super('Calendar attendee snapshot is unavailable');
  }
}
const address = z.string().trim().email().max(320);
const googleSnapshot = z.object({
  id: z.string(),
  etag: z.string().min(1).max(1024),
  status: z.enum(['confirmed', 'tentative']),
  organizer: z.object({ self: z.literal(true), email: address }),
  attendeesOmitted: z.literal(false).optional(),
  recurrence: z.array(z.string()).max(0).optional(),
  recurringEventId: z.never().optional(),
  attendees: z
    .array(
      z.object({
        email: address,
        displayName: z.string().max(512).optional(),
        responseStatus: z.string().max(64).optional(),
        resource: z.boolean().optional(),
        optional: z.boolean().optional(),
      })
    )
    .max(100),
});
const graphSnapshot = z.object({
  id: z.string(),
  changeKey: z.string().min(1).max(1024),
  isOrganizer: z.literal(true),
  isCancelled: z.literal(false),
  type: z.literal('singleInstance'),
  recurrence: z.null(),
  organizer: z.object({ emailAddress: z.object({ address }) }),
  '@odata.nextLink': z.never().optional(),
  'attendees@odata.nextLink': z.never().optional(),
  attendees: z
    .array(
      z.object({
        emailAddress: z.object({
          address,
          name: z.string().max(512).optional(),
        }),
        type: z.enum(['required', 'optional', 'resource']),
        status: z.object({
          response: z.string().max(64),
          time: z.string().optional(),
        }),
      })
    )
    .max(100),
});
export function parseAttendeeSnapshot(
  source: ResolvedCalendarSource,
  eventId: string,
  providerEventId: string,
  input: unknown
): CalendarAttendeeSnapshot {
  if (source.provider === 'tuturuuu' || !source.accountEmail)
    throw new AttendeeSnapshotError(409);
  const common = {
    eventId,
    provider: source.provider,
    connectionId: source.connectionId,
    calendarId: source.externalCalendarId,
    attendeeEditing: false as const,
  };
  if (source.provider === 'google') {
    const result = googleSnapshot.safeParse(input);
    if (
      !result.success ||
      result.data.id !== providerEventId ||
      result.data.organizer.email.toLowerCase() !==
        source.accountEmail.trim().toLowerCase()
    )
      throw new AttendeeSnapshotError(409);
    return {
      ...common,
      revision: result.data.etag,
      attendees: result.data.attendees.map((guest) => ({
        email: guest.email,
        name: guest.displayName,
        response: guest.responseStatus,
        resource: guest.resource === true,
        optional: guest.optional === true,
      })),
    };
  }
  const result = graphSnapshot.safeParse(input);
  if (
    !result.success ||
    result.data.id !== providerEventId ||
    result.data.organizer.emailAddress.address.toLowerCase() !==
      source.accountEmail.trim().toLowerCase()
  )
    throw new AttendeeSnapshotError(409);
  return {
    ...common,
    revision: result.data.changeKey,
    attendees: result.data.attendees.map((guest) => ({
      email: guest.emailAddress.address,
      name: guest.emailAddress.name,
      response: guest.status.response,
      resource: guest.type === 'resource',
      optional: guest.type === 'optional',
    })),
  };
}
export async function readAttendeeSnapshot(
  source: ResolvedCalendarSource,
  eventId: string,
  providerEventId: string
) {
  if (source.provider === 'tuturuuu' || !source.accessToken)
    throw new AttendeeSnapshotError(409);
  let input: unknown;
  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });
    const response = await calendar.events.get(
      {
        calendarId: source.externalCalendarId,
        eventId: providerEventId,
        fields:
          'id,etag,status,organizer,attendees,attendeesOmitted,recurrence,recurringEventId',
      },
      { retry: false, timeout: 10_000 }
    );
    input = response.data;
  } else {
    const url = new URL(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(source.externalCalendarId)}/events/${encodeURIComponent(providerEventId)}`
    );
    url.searchParams.set(
      '$select',
      'id,changeKey,isOrganizer,isCancelled,type,recurrence,organizer,attendees'
    );
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${source.accessToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new AttendeeSnapshotError(503);
    input = await response.json();
  }
  return parseAttendeeSnapshot(source, eventId, providerEventId, input);
}
