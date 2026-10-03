import { createHash } from 'node:crypto';
import { type calendar_v3, google, OAuth2Client } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import type { GoogleEventColor } from '@tuturuuu/utils/google-calendar-colors';
import { GOOGLE_COLOR_IDS } from '@tuturuuu/utils/google-calendar-colors';
import type { MeetingInvitationInput } from '@tuturuuu/utils/meeting-invitations';
import {
  GoogleColorChoiceError,
  resolveGoogleColorChoice,
} from './google-color-choices';
import {
  googleMeetingGuests,
  microsoftMeetingGuests,
  microsoftUtcDateTime,
} from './meeting-provider-payloads';
import type { ResolvedCalendarSource } from './source-resolver';

type ExternalProvider = 'google' | 'microsoft';

export type ProviderEventWriteResult = {
  provider: ExternalProvider;
  externalCalendarId: string;
  externalEventId: string;
  googleColor?: GoogleEventColor;
  googleSourceColor?: string;
};

type ProviderEventInput = Pick<
  CalendarEvent,
  'title' | 'description' | 'location' | 'start_at' | 'end_at' | 'color'
> & {
  invitation?: MeetingInvitationInput;
  providerColor?: GoogleProviderColorChoice;
  providerColorOnly?: boolean;
  nativeColorChange?: boolean;
};

type ExistingExternalEvent = {
  provider?: string | null;
  external_calendar_id?: string | null;
  external_event_id?: string | null;
  google_calendar_id?: string | null;
  google_event_id?: string | null;
};

function providerErrorStatus(error: unknown): number | null {
  const seen = new Set<object>();
  let current = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      response?: { status?: unknown };
      status?: unknown;
      statusCode?: unknown;
    };
    const statuses = [
      candidate.status,
      candidate.statusCode,
      candidate.code,
      candidate.response?.status,
    ];

    for (const status of statuses) {
      const numericStatus =
        typeof status === 'number'
          ? status
          : typeof status === 'string'
            ? Number.parseInt(status, 10)
            : Number.NaN;
      if (Number.isInteger(numericStatus)) return numericStatus;
    }

    current = candidate.cause;
  }

  return null;
}

export function isProviderEventAlreadyDeletedError(error: unknown) {
  const status = providerErrorStatus(error);
  return status === 404 || status === 410;
}

function assertExternalSource(
  source: ResolvedCalendarSource
): asserts source is ResolvedCalendarSource & {
  provider: ExternalProvider;
  externalCalendarId: string;
  accessToken: string;
} {
  if (source.provider !== 'google' && source.provider !== 'microsoft') {
    throw new Error('Source is not an external calendar provider');
  }

  if (!source.accessToken) {
    throw new Error('Calendar provider credentials are unavailable');
  }
}

export function createGoogleAuthClient(source: ResolvedCalendarSource) {
  const oauth2Client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials({
    access_token: source.accessToken,
    refresh_token: source.refreshToken ?? undefined,
  });

  return oauth2Client;
}

function toGoogleEvent(event: ProviderEventInput): calendar_v3.Schema$Event {
  return {
    ...(event.color ? { colorId: GOOGLE_COLOR_IDS[event.color] } : {}),
    ...googleMeetingGuests(event.invitation),
    summary: event.title || 'Untitled Event',
    description: event.description || '',
    location: event.location || undefined,
    start: {
      dateTime: event.start_at,
      ...(event.invitation ? { timeZone: event.invitation.timeZone } : {}),
    },
    end: {
      dateTime: event.end_at,
      ...(event.invitation ? { timeZone: event.invitation.timeZone } : {}),
    },
  };
}

function toMicrosoftEvent(event: ProviderEventInput) {
  return {
    ...microsoftMeetingGuests(event.invitation),
    subject: event.title || 'Untitled Event',
    body: {
      contentType: 'text',
      content: event.description || '',
    },
    location: {
      displayName: event.location || '',
    },
    start: microsoftUtcDateTime(event.start_at),
    end: microsoftUtcDateTime(event.end_at),
  };
}

function normalizeExistingProviderEvent(event: ExistingExternalEvent) {
  const provider = event.provider as ExternalProvider | undefined;
  const externalCalendarId =
    event.external_calendar_id ?? event.google_calendar_id ?? null;
  const externalEventId =
    event.external_event_id ?? event.google_event_id ?? null;

  if (
    (provider !== 'google' && provider !== 'microsoft') ||
    !externalCalendarId ||
    !externalEventId
  ) {
    return null;
  }

  return {
    provider,
    externalCalendarId,
    externalEventId,
  };
}

export async function createProviderEvent(args: {
  source: ResolvedCalendarSource;
  event: ProviderEventInput;
  idempotencyKey?: string;
}): Promise<ProviderEventWriteResult | null> {
  const { source, event } = args;
  if (event.providerColor && source.provider !== 'google')
    throw new GoogleColorChoiceError(
      'Google color choice requires a Google calendar'
    );
  if (source.provider === 'tuturuuu') return null;
  assertExternalSource(source);

  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });

    const stableId = args.idempotencyKey?.replaceAll('-', '').toLowerCase();
    const selected = event.providerColor
      ? await resolveGoogleColorChoice(calendar, source, event.providerColor)
      : null;
    const payload = toGoogleEvent(event);
    if (selected) {
      delete payload.colorId;
      Object.assign(payload, selected.fields);
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    let response: { data: calendar_v3.Schema$Event };
    try {
      response = await calendar.events.insert({
        calendarId: source.externalCalendarId,
        ...(event.providerColor?.kind !== 'event' && event.providerColor
          ? { eventLabelVersion: 1 }
          : {}),
        sendUpdates: 'all',
        requestBody: {
          ...payload,
          ...(stableId
            ? {
                id: stableId,
                extendedProperties: {
                  private: { tuturuuu_request_hash: requestHash },
                },
              }
            : {}),
        },
      });
    } catch (error) {
      if (selected && providerErrorStatus(error) === 400)
        throw new GoogleColorChoiceError(
          'Google color choice changed; reload available colors before trying again',
          409
        );
      if (!stableId || providerErrorStatus(error) !== 409) throw error;
      response = await calendar.events.get({
        calendarId: source.externalCalendarId,
        eventId: stableId,
      });
      if (
        response.data.status === 'cancelled' ||
        response.data.id !== stableId ||
        response.data.extendedProperties?.private?.tuturuuu_request_hash !==
          requestHash
      ) {
        throw error;
      }
    }

    if (!response.data.id) {
      throw new Error('Google Calendar did not return an event id');
    }

    return {
      provider: 'google',
      externalCalendarId: source.externalCalendarId,
      externalEventId: response.data.id,
      ...(selected
        ? {
            googleColor: selected.metadata,
            googleSourceColor: selected.sourceBackground,
          }
        : {}),
    };
  }

  const client = createGraphClient(source.accessToken) as any;
  const response = await client
    .api(`/me/calendars/${source.externalCalendarId}/events`)
    .header('Prefer', 'IdType="ImmutableId"')
    .post({
      ...toMicrosoftEvent(event),
      ...(args.idempotencyKey ? { transactionId: args.idempotencyKey } : {}),
    });

  if (!response?.id) {
    throw new Error('Microsoft Calendar did not return an event id');
  }

  return {
    provider: 'microsoft',
    externalCalendarId: source.externalCalendarId,
    externalEventId: response.id,
  };
}

export async function updateProviderEvent(args: {
  source: ResolvedCalendarSource;
  existingEvent: ExistingExternalEvent;
  event: ProviderEventInput;
}): Promise<ProviderEventWriteResult | null> {
  const { source, existingEvent, event } = args;
  if (event.providerColor && source.provider !== 'google')
    throw new GoogleColorChoiceError(
      'Google color choice requires a Google calendar'
    );
  if (source.provider === 'tuturuuu') return null;
  assertExternalSource(source);

  const existing = normalizeExistingProviderEvent(existingEvent);
  if (!existing || existing.provider !== source.provider) {
    return createProviderEvent({ source, event });
  }

  if (source.externalCalendarId !== existing.externalCalendarId)
    throw new GoogleColorChoiceError(
      'Event does not belong to the selected calendar'
    );

  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });

    // Use the current provider copy, including labels absent from older DB rows.
    // Never turn an unrelated edit or stale native enum into a color change.
    const current = await calendar.events.get({
      calendarId: existing.externalCalendarId,
      eventId: existing.externalEventId,
    });
    const choice =
      event.providerColor ??
      (event.nativeColorChange && event.color && source.provider === 'google'
        ? {
            connectionId: source.connectionId,
            kind: 'event' as const,
            id: GOOGLE_COLOR_IDS[event.color],
          }
        : undefined);
    const selected = choice
      ? await resolveGoogleColorChoice(calendar, source, choice)
      : null;
    if (choice && !current.data.etag)
      throw new GoogleColorChoiceError(
        'Google event version is unavailable; refresh before changing color',
        409
      );
    const payload: calendar_v3.Schema$Event = event.providerColorOnly
      ? {}
      : toGoogleEvent(event);
    delete payload.colorId;
    let labelVersion: number | undefined;
    if (selected) {
      Object.assign(payload, selected.fields);
      if (choice?.kind === 'event') labelVersion = 0;
      else {
        labelVersion = 1;
        payload.eventLabelId = selected.fields.eventLabelId ?? '';
      }
    } else if (event.nativeColorChange && event.color) {
      payload.colorId = GOOGLE_COLOR_IDS[event.color];
      labelVersion = 0;
    } else {
      if (current.data.colorId) payload.colorId = current.data.colorId;
      if (current.data.eventLabelId) {
        payload.eventLabelId = current.data.eventLabelId;
        labelVersion = 1;
      }
    }
    try {
      await calendar.events.patch(
        {
          calendarId: existing.externalCalendarId,
          eventId: existing.externalEventId,
          sendUpdates: event.providerColorOnly ? 'none' : 'all',
          ...(labelVersion === undefined
            ? {}
            : { eventLabelVersion: labelVersion }),
          requestBody: payload,
        },
        current.data.etag
          ? { headers: { 'If-Match': current.data.etag } }
          : undefined
      );
    } catch (error) {
      if (choice && providerErrorStatus(error) === 400)
        throw new GoogleColorChoiceError(
          'Google color choice changed; reload available colors before trying again',
          409
        );
      if (providerErrorStatus(error) === 412)
        throw new GoogleColorChoiceError(
          'Google event changed; refresh before trying again',
          409
        );
      throw error;
    }
    if (selected)
      return {
        ...existing,
        googleColor: selected.metadata,
        googleSourceColor: selected.sourceBackground,
      };

    return existing;
  }

  const client = createGraphClient(source.accessToken) as any;
  await client
    .api(
      `/me/calendars/${existing.externalCalendarId}/events/${existing.externalEventId}`
    )
    .header('Prefer', 'IdType="ImmutableId"')
    .patch(toMicrosoftEvent(event));

  return existing;
}

export async function deleteProviderEvent(args: {
  source: ResolvedCalendarSource;
  existingEvent: ExistingExternalEvent;
}) {
  const { source, existingEvent } = args;
  if (source.provider === 'tuturuuu') return;
  assertExternalSource(source);

  const existing = normalizeExistingProviderEvent(existingEvent);
  if (!existing || existing.provider !== source.provider) return;

  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });

    try {
      await calendar.events.delete({
        calendarId: existing.externalCalendarId,
        eventId: existing.externalEventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      // Provider deletions are idempotent. Google returns 410 when a synced
      // event was already removed, and can return 404 after it is purged.
      if (!isProviderEventAlreadyDeletedError(error)) throw error;
    }
    return;
  }

  const client = createGraphClient(source.accessToken) as any;
  try {
    await client
      .api(
        `/me/calendars/${existing.externalCalendarId}/events/${existing.externalEventId}`
      )
      .header('Prefer', 'IdType="ImmutableId"')
      .delete();
  } catch (error) {
    if (!isProviderEventAlreadyDeletedError(error)) throw error;
  }
}

export async function moveProviderEvent(args: {
  fromSource: ResolvedCalendarSource;
  toSource: ResolvedCalendarSource;
  existingEvent: ExistingExternalEvent;
  event: ProviderEventInput;
}): Promise<ProviderEventWriteResult | null> {
  const { fromSource, toSource, existingEvent, event } = args;
  const existing = normalizeExistingProviderEvent(existingEvent);

  if (!existing || fromSource.provider === 'tuturuuu') {
    return createProviderEvent({ source: toSource, event });
  }

  if (toSource.provider === 'tuturuuu') {
    await deleteProviderEvent({ source: fromSource, existingEvent });
    return null;
  }

  assertExternalSource(fromSource);
  assertExternalSource(toSource);

  if (fromSource.provider === 'google' && toSource.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(fromSource),
    });

    const current = await calendar.events.get({
      calendarId: existing.externalCalendarId,
      eventId: existing.externalEventId,
    });
    if (
      current.data.eventLabelId ||
      event.providerColor ||
      event.nativeColorChange
    ) {
      throw new GoogleColorChoiceError(
        'Moving a labeled event or changing color while moving requires reconciliation; change color within its current calendar first',
        409
      );
    }
    // Do not hide a failed move/patch behind create-delete: that can duplicate
    // events and discard calendar-scoped labels or provider-only fields.
    let response: { data: calendar_v3.Schema$Event };
    try {
      response = await calendar.events.move(
        {
          calendarId: existing.externalCalendarId,
          eventId: existing.externalEventId,
          destination: toSource.externalCalendarId,
          sendUpdates: 'all',
        },
        current.data.etag
          ? { headers: { 'If-Match': current.data.etag } }
          : undefined
      );
    } catch (error) {
      if (providerErrorStatus(error) === 412)
        throw new GoogleColorChoiceError(
          'Google event changed; refresh before moving it',
          409
        );
      throw error;
    }
    if (!response.data.id)
      throw new GoogleColorChoiceError(
        'Google calendar move did not return an event identity',
        502
      );
    const updated = await updateProviderEvent({
      source: toSource,
      existingEvent: {
        provider: 'google',
        external_calendar_id: toSource.externalCalendarId,
        external_event_id: response.data.id,
      },
      event,
    });
    return updated;
  }

  if (fromSource.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(fromSource),
    });
    const current = await calendar.events.get({
      calendarId: existing.externalCalendarId,
      eventId: existing.externalEventId,
    });
    if (current.data.eventLabelId)
      throw new GoogleColorChoiceError(
        'A Google labeled event cannot be copied to this provider without choosing a supported destination color',
        409
      );
  }
  const created = await createProviderEvent({ source: toSource, event });
  await deleteProviderEvent({ source: fromSource, existingEvent });
  return created;
}
