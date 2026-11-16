import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  parseAttendeeSnapshot,
  readAttendeeSnapshot,
} from './attendee-snapshot';
import type { ResolvedCalendarSource } from './source-resolver';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { get: mocks.get } }) },
}));
vi.mock('./provider-writes', () => ({ createGoogleAuthClient: () => ({}) }));
const source: ResolvedCalendarSource = {
  provider: 'google',
  connectionId: 'connection',
  workspaceCalendarId: 'local',
  externalCalendarId: 'calendar',
  accessRole: 'writer',
  accountEmail: 'host@example.invalid',
  accountName: null,
  label: 'Calendar',
  color: null,
  accessToken: 'private-fixture',
};
const googleEvent = {
  id: 'event',
  etag: 'revision',
  status: 'confirmed',
  organizer: { self: true, email: 'host@example.invalid' },
  attendees: [
    {
      email: 'guest@example.invalid',
      responseStatus: 'accepted',
      resource: true,
      optional: true,
      comment: 'untouched private comment',
    },
  ],
};
const graphEvent = {
  id: 'event',
  changeKey: 'revision',
  isOrganizer: true,
  isCancelled: false,
  type: 'singleInstance',
  recurrence: null,
  organizer: { emailAddress: { address: 'host@example.invalid' } },
  attendees: [
    {
      emailAddress: { address: 'guest@example.invalid' },
      type: 'resource',
      status: { response: 'accepted', time: 'original' },
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it.each(['google', 'microsoft'] as const)(
  'returns revision and guest projection from eligible %s without changing provider metadata',
  (provider) => {
    const input = provider === 'google' ? googleEvent : graphEvent;
    const before = structuredClone(input);
    const snapshot = parseAttendeeSnapshot(
      { ...source, provider },
      'local-event',
      'event',
      input
    );
    expect(snapshot).toMatchObject({
      eventId: 'local-event',
      provider,
      revision: 'revision',
      attendeeEditing: false,
      attendees: [
        {
          email: 'guest@example.invalid',
          response: 'accepted',
          resource: true,
        },
      ],
    });
    expect(input).toEqual(before);
    expect(snapshot).not.toHaveProperty('accessToken');
    expect(snapshot).not.toHaveProperty('organizer');
  }
);
it.each([
  { organizer: { self: false, email: 'host@example.invalid' } },
  { organizer: { self: true, email: 'foreign@example.invalid' } },
  { attendeesOmitted: true },
  { attendees: undefined },
  { recurringEventId: 'master' },
  { recurrence: ['RRULE:FREQ=DAILY'] },
  { status: 'cancelled' },
  { etag: '' },
  { id: 'foreign' },
])('refuses an ineligible or partial Google snapshot %j', (change) => {
  expect(() =>
    parseAttendeeSnapshot(source, 'local-event', 'event', {
      ...googleEvent,
      ...change,
    })
  ).toThrow('unavailable');
});
it.each([
  { isOrganizer: false },
  { organizer: { emailAddress: { address: 'other@example.invalid' } } },
  { attendees: undefined },
  { type: 'occurrence' },
  { type: 'seriesMaster' },
  { recurrence: {} },
  { '@odata.nextLink': 'partial' },
  { 'attendees@odata.nextLink': 'partial' },
  { changeKey: '' },
  { isCancelled: true },
])('refuses an ineligible or partial Graph snapshot %j', (change) => {
  expect(() =>
    parseAttendeeSnapshot(
      { ...source, provider: 'microsoft' },
      'local-event',
      'event',
      { ...graphEvent, ...change }
    )
  ).toThrow('unavailable');
});
it('bounds Google reads without retry and uses only verified provider IDs', async () => {
  mocks.get.mockResolvedValue({ data: googleEvent });
  expect(
    (await readAttendeeSnapshot(source, 'local-event', 'event')).revision
  ).toBe('revision');
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ calendarId: 'calendar', eventId: 'event' }),
    { retry: false, timeout: 10_000 }
  );
});
it('uses a single read-only bounded Graph request and never PATCHes', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(graphEvent));
  vi.stubGlobal('fetch', fetch);
  expect(
    (
      await readAttendeeSnapshot(
        { ...source, provider: 'microsoft' },
        'local-event',
        'event'
      )
    ).attendeeEditing
  ).toBe(false);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    expect.any(URL),
    expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
  );
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    '/me/calendars/calendar/events/event'
  );
});

it('rejects hidden or missing guest addresses instead of returning a partial list', () => {
  expect(() =>
    parseAttendeeSnapshot(source, 'local-event', 'event', {
      ...googleEvent,
      attendees: [{ resource: true }],
    })
  ).toThrow('unavailable');
  expect(() =>
    parseAttendeeSnapshot(
      { ...source, provider: 'microsoft' },
      'local-event',
      'event',
      {
        ...graphEvent,
        attendees: [
          {
            emailAddress: {},
            type: 'required',
            status: { response: 'accepted' },
          },
        ],
      }
    )
  ).toThrow('unavailable');
});
