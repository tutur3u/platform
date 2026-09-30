import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  googleGet: vi.fn(),
  graphGet: vi.fn(),
  graphApi: vi.fn(),
  graphHeader: vi.fn(),
  graphSelect: vi.fn(),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventFromStorage: mocks.decrypt,
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { get: mocks.googleGet } }) },
}));
vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: () => ({ api: mocks.graphApi }),
}));
vi.mock('./provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));

import {
  getAuthorizedCalendarLinkPreview,
  readCalendarProviderPreviewEvent,
  validateCalendarJoinUrl,
} from './mail-link-preview';
import { resolveCalendarPreviewSource } from './source-resolver';

const event = {
  id: 'event',
  ws_id: 'ws',
  provider: 'google',
  source_calendar_id: 'native-source',
  external_calendar_id: 'provider-calendar',
  external_event_id: 'provider-event',
  is_encrypted: true,
};
const token = {
  id: 'account-row',
  ws_id: 'ws',
  user_id: 'actor',
  provider: 'google',
  account_email: 'actor@example.com',
  account_name: 'Actor',
  access_token: 'SECRET',
  refresh_token: 'SECRET_REFRESH',
  is_active: true,
};
const connection = {
  id: 'connection',
  ws_id: 'ws',
  provider: 'google',
  auth_token_id: 'account-row',
  workspace_calendar_id: 'native-source',
  calendar_id: 'provider-calendar',
  is_enabled: true,
  access_role: 'reader',
  calendar_name: 'Read only',
  color: null,
};
const providerEvent = {
  id: 'provider-event',
  summary: 'Provider title',
  etag: 'version',
  updated: 'revision',
  start: { dateTime: '2026-09-30T15:00:00+07:00', timeZone: 'Asia/Bangkok' },
  end: { dateTime: '2026-09-30T16:00:00+07:00', timeZone: 'Asia/Bangkok' },
  originalStartTime: {
    dateTime: '2026-09-29T15:00:00+07:00',
    timeZone: 'Asia/Bangkok',
  },
  recurringEventId: 'series',
  organizer: { email: 'organizer@example.com' },
  attendees: [
    { email: 'actor@example.com', responseStatus: 'accepted' },
    { email: 'hidden@example.com' },
  ],
  guestsCanSeeOtherGuests: false,
  location: 'Room 3',
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  description: 'SECRET BODY',
};

/** Concrete query fake applies equality/in filters instead of returning unauthorized fixture rows. */
function db(rows: Record<string, Record<string, any>[]>) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> =
    [];
  return {
    queries,
    schema() {
      return this;
    },
    from(table: string) {
      let data = rows[table] ?? [];
      const record = { table, filters: [] as Array<[string, unknown]> };
      queries.push(record);
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          record.filters.push([key, value]);
          data = data.filter((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          record.filters.push([key, values]);
          data = data.filter((row) => values.includes(row[key]));
          return query;
        },
        maybeSingle: async () => ({
          data: data.length === 1 ? data[0] : null,
          error: null,
        }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders intentionally implement PromiseLike.
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  };
}
const makeDb = (extra: Partial<Record<string, Record<string, any>[]>> = {}) =>
  db({
    workspace_calendar_events: [event],
    workspace_calendars: [
      { id: 'native-source', ws_id: 'ws', is_enabled: true },
    ],
    calendar_auth_tokens: [token],
    calendar_connections: [connection],
    ...extra,
  });
const args = (
  database: ReturnType<typeof db>,
  readProviderEvent = vi.fn(async () => providerEvent)
) => ({
  sbAdmin: database as any,
  wsId: 'ws',
  userId: 'actor',
  eventId: 'event',
  readProviderEvent,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decrypt.mockImplementation(async (value) => ({
    ...value,
    title: 'Decrypted local',
    location: 'Room',
    start_at: '2026-09-30T12:00:00Z',
    end_at: '2026-09-30T13:00:00Z',
  }));
  mocks.graphApi.mockReturnValue({ header: mocks.graphHeader });
  mocks.graphHeader.mockReturnValue({ select: mocks.graphSelect });
  mocks.graphSelect.mockReturnValue({ get: mocks.graphGet });
});

describe('authorized Calendar link preview', () => {
  it('uses an exact read-only actor-owned source, decrypts after source authorization and returns only provider authority', async () => {
    const database = makeDb();
    const preview = await getAuthorizedCalendarLinkPreview(args(database));
    expect(preview?.identity).toMatchObject({
      actorUserId: 'actor',
      accountOwnerId: 'account-row',
      connectionId: 'connection',
      sourceCalendarId: 'native-source',
      externalCalendarId: 'provider-calendar',
      externalEventId: 'provider-event',
      iCalUid: null,
    });
    expect(preview?.title).toBe('Provider title');
    expect(preview?.identity.occurrence).toEqual({
      value: '2026-09-29T15:00:00+07:00',
      valueType: 'DATE-TIME',
      tzid: 'Asia/Bangkok',
    });
    expect(preview?.attendees).toHaveLength(1);
    expect(preview?.attendees[0]?.responseStatus).toBe('accepted');
    expect(JSON.stringify(preview)).not.toMatch(
      /SECRET|hidden@example|access_token|refresh_token/
    );
    expect(mocks.decrypt).toHaveBeenCalledWith(event, 'ws');
    expect(
      database.queries.find((query) => query.table === 'calendar_auth_tokens')
        ?.filters
    ).toContainEqual(['user_id', 'actor']);
  });
  it.each([
    [
      'disabled workspace source',
      {
        workspace_calendars: [
          { id: 'native-source', ws_id: 'ws', is_enabled: false },
        ],
      },
    ],
    [
      'different actor',
      { calendar_auth_tokens: [{ ...token, user_id: 'other' }] },
    ],
    [
      'disabled connection',
      { calendar_connections: [{ ...connection, is_enabled: false }] },
    ],
    [
      'inactive account',
      { calendar_auth_tokens: [{ ...token, is_active: false }] },
    ],
    [
      'mismatched source',
      {
        calendar_connections: [
          { ...connection, workspace_calendar_id: 'other' },
        ],
      },
    ],
    [
      'mismatched external calendar',
      { calendar_connections: [{ ...connection, calendar_id: 'other' }] },
    ],
    [
      'ambiguous connections',
      {
        calendar_connections: [connection, { ...connection, id: 'duplicate' }],
      },
    ],
    [
      'missing explicit source',
      { workspace_calendar_events: [{ ...event, source_calendar_id: null }] },
    ],
    [
      'legacy provider identity',
      { workspace_calendar_events: [{ ...event, provider: null }] },
    ],
    [
      'different workspace',
      { workspace_calendar_events: [{ ...event, ws_id: 'other' }] },
    ],
  ])(
    'suppresses %s without decrypting or calling the provider',
    async (_, rows) => {
      const read = vi.fn();
      expect(
        await getAuthorizedCalendarLinkPreview(args(makeDb(rows), read))
      ).toBeNull();
      expect(read).not.toHaveBeenCalled();
      expect(mocks.decrypt).not.toHaveBeenCalled();
    }
  );
  it('fails closed for cancellation and decrypt failures', async () => {
    expect(
      await getAuthorizedCalendarLinkPreview(
        args(
          makeDb(),
          vi.fn(async () => ({ ...providerEvent, status: 'cancelled' }))
        )
      )
    ).toBeNull();
    mocks.decrypt.mockRejectedValue(new Error('encrypted secret'));
    const read = vi.fn();
    await expect(
      getAuthorizedCalendarLinkPreview(args(makeDb(), read))
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it('returns local content after decryption with unknown provider ownership and stable content revision', async () => {
    const database = makeDb({
      workspace_calendar_events: [
        {
          ...event,
          provider: 'tuturuuu',
          external_event_id: null,
          external_calendar_id: null,
        },
      ],
    });
    const preview = await getAuthorizedCalendarLinkPreview(args(database));
    expect(preview?.title).toBe('Decrypted local');
    expect(preview?.identity).toMatchObject({
      accountOwnerId: null,
      accountEmail: null,
      connectionId: null,
      iCalUid: null,
      occurrence: null,
    });
    expect(preview?.revision).toHaveLength(64);
    expect(database.queries).toHaveLength(2);
  });
  it('uses exact Google GET and rejects cancelled/mismatched provider IDs', async () => {
    const source = (await resolveCalendarPreviewSource({
      sbAdmin: makeDb() as any,
      wsId: 'ws',
      userId: 'actor',
      provider: 'google',
      workspaceCalendarId: 'native-source',
      externalCalendarId: 'provider-calendar',
    }))!;
    mocks.googleGet.mockResolvedValue({ data: providerEvent });
    await readCalendarProviderPreviewEvent(source, 'provider-event');
    expect(mocks.googleGet).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'provider-calendar',
        eventId: 'provider-event',
      })
    );
    mocks.googleGet.mockResolvedValue({
      data: { ...providerEvent, id: 'different' },
    });
    expect(
      await readCalendarProviderPreviewEvent(source, 'provider-event')
    ).toBeNull();
    mocks.googleGet.mockResolvedValue({
      data: { ...providerEvent, status: 'cancelled' },
    });
    expect(
      await readCalendarProviderPreviewEvent(source, 'provider-event')
    ).toBeNull();
  });
  it('uses calendar-scoped Microsoft immutable GET and preserves UTC occurrence and hidden attendee state', async () => {
    const database = makeDb({
      workspace_calendar_events: [{ ...event, provider: 'microsoft' }],
      calendar_auth_tokens: [{ ...token, provider: 'microsoft' }],
      calendar_connections: [{ ...connection, provider: 'microsoft' }],
    });
    mocks.graphGet.mockResolvedValue({
      id: 'immutable',
      iCalUId: 'actual-provider-uid',
      originalStart: '2026-09-29T08:00:00Z',
      subject: 'MS authority',
      location: {
        displayName: 'Office',
        address: {
          street: '1 Main Street',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          countryOrRegion: 'US',
        },
      },
      hideAttendees: true,
      attendees: [
        {
          emailAddress: { address: 'actor@example.com' },
          status: { response: 'accepted' },
        },
        { emailAddress: { address: 'hidden@example.com' } },
      ],
      start: { dateTime: '2026-09-30T08:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-09-30T09:00:00', timeZone: 'UTC' },
      onlineMeeting: { joinUrl: 'javascript:alert(1)' },
    });
    const preview = await getAuthorizedCalendarLinkPreview({
      ...args(database),
      readProviderEvent: readCalendarProviderPreviewEvent,
    });
    expect(mocks.graphApi).toHaveBeenCalledWith(
      '/me/calendars/provider-calendar/events/provider-event'
    );
    expect(mocks.graphHeader).toHaveBeenCalledWith(
      'Prefer',
      'IdType="ImmutableId"'
    );
    expect(preview?.identity).toMatchObject({
      externalEventId: 'immutable',
      iCalUid: 'actual-provider-uid',
      occurrence: {
        value: '2026-09-29T08:00:00Z',
        valueType: 'DATE-TIME',
        tzid: null,
      },
    });
    expect(preview?.attendees).toHaveLength(1);
    expect(preview?.joinUrl).toBeNull();
    expect(preview?.location?.address).toEqual({
      street: '1 Main Street',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      countryOrRegion: 'US',
    });
    mocks.graphGet.mockResolvedValue({ id: 'immutable', isCancelled: true });
    expect(
      await getAuthorizedCalendarLinkPreview({
        ...args(database),
        readProviderEvent: readCalendarProviderPreviewEvent,
      })
    ).toBeNull();
  });
  it.each([
    'javascript:alert(1)',
    'https://evil.example/a',
    'https://meet.google.com.evil.example/a',
    'https://user:password@teams.microsoft.com/a',
    'http://meet.google.com/a',
  ])('rejects join URL %s', (value) =>
    expect(validateCalendarJoinUrl(value)).toBeNull()
  );
});
