import { createHash } from 'node:crypto';
import { google } from '@tuturuuu/google';
import type {
  CalendarEventLinkPreview,
  CalendarOccurrenceIdentity,
  CalendarPreviewPerson,
} from '@tuturuuu/internal-api/calendar';
import { createGraphClient } from '@tuturuuu/microsoft';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { decryptCalendarEventForPreview } from './mail-link-preview-decryption';
import { createGoogleAuthClient } from './provider-writes';
import {
  isCalendarPreviewSourceEnabled,
  resolveCalendarPreviewSource,
} from './source-resolver';

type PreviewSource = NonNullable<
  Awaited<ReturnType<typeof resolveCalendarPreviewSource>>
>;
type ProviderEvent = Record<string, any>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function dateTime(
  value:
    | { date?: unknown; dateTime?: unknown; timeZone?: unknown }
    | null
    | undefined
): CalendarOccurrenceIdentity | null {
  if (text(value?.date))
    return { value: value!.date as string, valueType: 'DATE', tzid: null };
  if (text(value?.dateTime))
    return {
      value: value!.dateTime as string,
      valueType: 'DATE-TIME',
      tzid: text(value?.timeZone),
    };
  return null;
}

function person(
  value: ProviderEvent | null | undefined,
  accountEmail: string
): CalendarPreviewPerson | null {
  const email = text(value?.email ?? value?.emailAddress?.address);
  if (!email && !text(value?.displayName ?? value?.emailAddress?.name))
    return null;
  return {
    email,
    name: text(value?.displayName ?? value?.emailAddress?.name),
    responseStatus: text(value?.responseStatus ?? value?.status?.response),
    self: email?.toLowerCase() === accountEmail.toLowerCase(),
  };
}

/** Only provider conferencing fields are examined; descriptions and locations are never parsed for links. */
export function validateCalendarJoinUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    if (
      !['meet.google.com', 'teams.microsoft.com', 'teams.live.com'].includes(
        url.hostname
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function readCalendarProviderPreviewEvent(
  source: PreviewSource,
  eventId: string
): Promise<ProviderEvent | null> {
  if (source.provider === 'google') {
    const { data } = await google
      .calendar({ version: 'v3', auth: createGoogleAuthClient(source) })
      .events.get({
        calendarId: source.externalCalendarId,
        eventId,
        fields:
          'id,status,etag,updated,sequence,summary,organizer,attendees,attendeesOmitted,guestsCanSeeOtherGuests,location,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),start,end,iCalUID,originalStartTime,recurringEventId,recurrence',
      });
    return data.id === eventId && data.status !== 'cancelled' ? data : null;
  }
  const event = await createGraphClient(source.accessToken!)
    .api(
      `/me/calendars/${encodeURIComponent(source.externalCalendarId)}/events/${encodeURIComponent(eventId)}`
    )
    .header('Prefer', 'IdType="ImmutableId"')
    .select(
      'id,isCancelled,changeKey,lastModifiedDateTime,subject,organizer,attendees,hideAttendees,location,onlineMeeting,start,end,iCalUId,originalStart,type,seriesMasterId'
    )
    .get();
  return event?.id && !event.isCancelled ? event : null;
}

export function projectCalendarProviderPreview(args: {
  event: ProviderEvent;
  source: PreviewSource;
  workspaceId: string;
  eventId: string;
  actorUserId: string;
}): CalendarEventLinkPreview {
  const { event, source } = args;
  const isGoogle = source.provider === 'google';
  const accountEmail = source.accountEmail!;
  const restricted = isGoogle
    ? event.guestsCanSeeOtherGuests === false || event.attendeesOmitted === true
    : event.hideAttendees === true;
  const attendees = (Array.isArray(event.attendees) ? event.attendees : [])
    .map((guest: ProviderEvent) => person(guest, accountEmail))
    .filter(
      (guest: CalendarPreviewPerson | null): guest is CalendarPreviewPerson =>
        !!guest && (!restricted || guest.self === true)
    );
  const original = isGoogle
    ? dateTime(event.originalStartTime)
    : text(event.originalStart)
      ? {
          value: event.originalStart as string,
          valueType: 'DATE-TIME' as const,
          tzid: null,
        }
      : null;
  const joinCandidate = isGoogle
    ? (event.conferenceData?.entryPoints?.find(
        (entry: ProviderEvent) => entry.entryPointType === 'video'
      )?.uri ?? event.hangoutLink)
    : event.onlineMeeting?.joinUrl;
  const start = dateTime(event.start);
  const end = dateTime(event.end);
  return {
    identity: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      actorUserId: args.actorUserId,
      provider: source.provider,
      accountOwnerId: source.accountOwnerId,
      accountEmail,
      connectionId: source.connectionId,
      calendarId: source.externalCalendarId,
      sourceCalendarId: source.workspaceCalendarId,
      externalCalendarId: source.externalCalendarId,
      externalEventId: text(event.id),
      iCalUid: text(isGoogle ? event.iCalUID : event.iCalUId),
      occurrence: original,
    },
    revision: text(
      isGoogle ? event.updated : (event.changeKey ?? event.lastModifiedDateTime)
    ),
    etag: text(event.etag ?? event['@odata.etag']),
    title: text(isGoogle ? event.summary : event.subject),
    organizer: person(
      event.organizer?.emailAddress
        ? { emailAddress: event.organizer.emailAddress }
        : event.organizer,
      accountEmail
    ),
    attendees,
    attendeesRestricted: restricted,
    location: isGoogle
      ? text(event.location)
        ? { displayName: text(event.location), address: null }
        : null
      : event.location
        ? {
            displayName: text(event.location.displayName),
            address: event.location.address
              ? {
                  street: text(event.location.address.street),
                  city: text(event.location.address.city),
                  state: text(event.location.address.state),
                  postalCode: text(event.location.address.postalCode),
                  countryOrRegion: text(event.location.address.countryOrRegion),
                }
              : null,
          }
        : null,
    joinUrl: validateCalendarJoinUrl(joinCandidate),
    start,
    end,
    timeZone: start?.tzid ?? end?.tzid ?? null,
    recurrence: {
      kind: original
        ? 'occurrence'
        : (isGoogle ? event.recurrence?.length : event.type === 'seriesMaster')
          ? 'series'
          : 'single',
      seriesEventId: text(
        isGoogle ? event.recurringEventId : event.seriesMasterId
      ),
    },
    accessRole: source.accessRole,
    accountLabel: source.accountName ?? source.accountEmail,
  };
}

/** Invoked only after the route has authorized workspace membership and manage_calendar. */
export async function getAuthorizedCalendarLinkPreview(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  eventId: string;
  userId: string;
  readProviderEvent?: typeof readCalendarProviderPreviewEvent;
}): Promise<CalendarEventLinkPreview | null> {
  const { data: stored, error } = await args.sbAdmin
    .from('workspace_calendar_events')
    .select('*')
    .eq('ws_id', args.wsId)
    .eq('id', args.eventId)
    .maybeSingle();
  if (error) throw new Error('Calendar preview unavailable');
  if (!stored) return null;
  if (stored.provider === 'google' || stored.provider === 'microsoft') {
    // Missing explicit source or provider ID is unknown identity, not permission to guess.
    if (
      !stored.source_calendar_id ||
      !stored.external_calendar_id ||
      !stored.external_event_id
    )
      return null;
    const source = await resolveCalendarPreviewSource({
      sbAdmin: args.sbAdmin,
      wsId: args.wsId,
      userId: args.userId,
      provider: stored.provider,
      workspaceCalendarId: stored.source_calendar_id,
      externalCalendarId: stored.external_calendar_id,
    });
    if (!source) return null;
    // Preserve the encrypted storage boundary, after authorizing the connected source.
    if (!(await decryptCalendarEventForPreview(stored, args.wsId))) return null;
    const event = await (
      args.readProviderEvent ?? readCalendarProviderPreviewEvent
    )(source, stored.external_event_id);
    if (!event || event.status === 'cancelled' || event.isCancelled)
      return null;
    return projectCalendarProviderPreview({
      event,
      source,
      workspaceId: args.wsId,
      eventId: args.eventId,
      actorUserId: args.userId,
    });
  }
  if (stored.provider && stored.provider !== 'tuturuuu') return null;
  // Legacy provider IDs without an explicit provider must never be classified as native.
  if (stored.external_event_id || stored.google_event_id) return null;
  if (
    stored.source_calendar_id &&
    !(await isCalendarPreviewSourceEnabled({
      sbAdmin: args.sbAdmin,
      wsId: args.wsId,
      workspaceCalendarId: stored.source_calendar_id,
    }))
  )
    return null;
  const event = await decryptCalendarEventForPreview(stored, args.wsId);
  if (!event) return null;
  const preview: CalendarEventLinkPreview = {
    identity: {
      workspaceId: args.wsId,
      eventId: args.eventId,
      actorUserId: args.userId,
      provider: 'tuturuuu',
      accountOwnerId: null,
      accountEmail: null,
      connectionId: null,
      calendarId: stored.source_calendar_id,
      sourceCalendarId: stored.source_calendar_id,
      externalCalendarId: null,
      externalEventId: null,
      iCalUid: null,
      occurrence: null,
    },
    revision: null,
    etag: null,
    title: text(event.title),
    organizer: null,
    attendees: [],
    attendeesRestricted: true,
    location: text(event.location)
      ? { displayName: text(event.location), address: null }
      : null,
    joinUrl: null,
    start: dateTime({ dateTime: event.start_at }),
    end: dateTime({ dateTime: event.end_at }),
    timeZone: null,
    recurrence: { kind: 'unknown', seriesEventId: null },
    accessRole: null,
    accountLabel: null,
  };
  preview.revision = createHash('sha256')
    .update(JSON.stringify(preview))
    .digest('hex');
  return preview;
}
