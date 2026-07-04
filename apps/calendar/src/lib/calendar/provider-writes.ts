import { type calendar_v3, google, OAuth2Client } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ResolvedCalendarSource } from './source-resolver';

type ExternalProvider = 'google' | 'microsoft';

export type ProviderEventWriteResult = {
  provider: ExternalProvider;
  externalCalendarId: string;
  externalEventId: string;
};

type ProviderEventInput = Pick<
  CalendarEvent,
  'title' | 'description' | 'location' | 'start_at' | 'end_at' | 'color'
>;

type ExistingExternalEvent = {
  provider?: string | null;
  external_calendar_id?: string | null;
  external_event_id?: string | null;
  google_calendar_id?: string | null;
  google_event_id?: string | null;
};

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

function createGoogleAuthClient(source: ResolvedCalendarSource) {
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
    summary: event.title || 'Untitled Event',
    description: event.description || '',
    location: event.location || undefined,
    start: {
      dateTime: event.start_at,
    },
    end: {
      dateTime: event.end_at,
    },
  };
}

function toMicrosoftEvent(event: ProviderEventInput) {
  return {
    subject: event.title || 'Untitled Event',
    body: {
      contentType: 'text',
      content: event.description || '',
    },
    location: {
      displayName: event.location || '',
    },
    start: {
      dateTime: event.start_at,
      timeZone: 'UTC',
    },
    end: {
      dateTime: event.end_at,
      timeZone: 'UTC',
    },
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
}): Promise<ProviderEventWriteResult | null> {
  const { source, event } = args;
  if (source.provider === 'tuturuuu') return null;
  assertExternalSource(source);

  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });

    const response = await calendar.events.insert({
      calendarId: source.externalCalendarId,
      requestBody: toGoogleEvent(event),
    });

    if (!response.data.id) {
      throw new Error('Google Calendar did not return an event id');
    }

    return {
      provider: 'google',
      externalCalendarId: source.externalCalendarId,
      externalEventId: response.data.id,
    };
  }

  const client = createGraphClient(source.accessToken) as any;
  const response = await client
    .api(`/me/calendars/${source.externalCalendarId}/events`)
    .header('Prefer', 'IdType="ImmutableId"')
    .post(toMicrosoftEvent(event));

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
  if (source.provider === 'tuturuuu') return null;
  assertExternalSource(source);

  const existing = normalizeExistingProviderEvent(existingEvent);
  if (!existing || existing.provider !== source.provider) {
    return createProviderEvent({ source, event });
  }

  if (source.provider === 'google') {
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });

    await calendar.events.patch({
      calendarId: existing.externalCalendarId,
      eventId: existing.externalEventId,
      requestBody: toGoogleEvent(event),
    });

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

    await calendar.events.delete({
      calendarId: existing.externalCalendarId,
      eventId: existing.externalEventId,
    });
    return;
  }

  const client = createGraphClient(source.accessToken) as any;
  await client
    .api(
      `/me/calendars/${existing.externalCalendarId}/events/${existing.externalEventId}`
    )
    .header('Prefer', 'IdType="ImmutableId"')
    .delete();
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

    try {
      const response = await calendar.events.move({
        calendarId: existing.externalCalendarId,
        eventId: existing.externalEventId,
        destination: toSource.externalCalendarId,
      });

      if (response.data.id) {
        await updateProviderEvent({
          source: toSource,
          existingEvent: {
            provider: 'google',
            external_calendar_id: toSource.externalCalendarId,
            external_event_id: response.data.id,
          },
          event,
        });

        return {
          provider: 'google',
          externalCalendarId: toSource.externalCalendarId,
          externalEventId: response.data.id,
        };
      }
    } catch {
      // Some Google event types cannot be moved. Fall through to create-delete.
    }
  }

  const created = await createProviderEvent({ source: toSource, event });
  await deleteProviderEvent({ source: fromSource, existingEvent });
  return created;
}
