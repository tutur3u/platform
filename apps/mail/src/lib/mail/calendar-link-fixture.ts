import type { CalendarEventLinkPreview } from '@tuturuuu/internal-api/calendar';
/** Synthetic fixtures only; no customer invitation data. */
export function calendarPreviewFixture(): CalendarEventLinkPreview {
  return {
    identity: {
      workspaceId: 'ws',
      eventId: 'event',
      provider: 'google',
      actorUserId: 'actor',
      accountOwnerId: 'account-row',
      accountEmail: 'guest@example.test',
      connectionId: 'connection',
      calendarId: 'calendar',
      sourceCalendarId: 'source',
      externalCalendarId: 'external-calendar',
      externalEventId: 'external-event',
      iCalUid: 'hold-uid',
      occurrence: {
        value: '20261002T133000',
        valueType: 'DATE-TIME',
        tzid: 'Custom:Zone',
      },
    },
    revision: 'rev',
    etag: 'etag',
    title: 'Private hold',
    organizer: { email: 'self@example.test', name: 'Self' },
    attendees: [
      {
        email: 'guest@example.test',
        name: 'Guest',
        responseStatus: 'needsAction',
      },
    ],
    attendeesRestricted: false,
    location: {
      displayName: 'Meeting room',
      address: {
        street: 'Street',
        city: 'City',
        state: 'State',
        postalCode: 'Postal',
        countryOrRegion: 'Country',
      },
    },
    joinUrl: 'https://teams.microsoft.com/meet/synthetic',
    start: {
      value: '2026-10-02T13:30:00+07:00',
      valueType: 'DATE-TIME',
      tzid: 'Asia/Ho_Chi_Minh',
    },
    end: {
      value: '2026-10-02T15:00:00+07:00',
      valueType: 'DATE-TIME',
      tzid: 'Asia/Ho_Chi_Minh',
    },
    timeZone: 'Asia/Ho_Chi_Minh',
    recurrence: { kind: 'occurrence', seriesEventId: 'series' },
    accessRole: 'writer',
    accountLabel: 'Personal',
  };
}
