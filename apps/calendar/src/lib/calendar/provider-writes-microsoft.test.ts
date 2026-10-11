import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: () => ({ api: mocks.api }),
}));
vi.mock('@tuturuuu/google', () => ({ google: {}, OAuth2Client: vi.fn() }));

import {
  createProviderEvent,
  deleteProviderEvent,
  updateProviderEvent,
} from './provider-writes';

const source = {
  provider: 'microsoft',
  accessToken: 'synthetic',
  externalCalendarId: 'calendar/a+b=',
} as any;
const event = {
  title: 'Meeting',
  start_at: '2026-10-07T09:00:00+07:00',
  end_at: '2026-10-07T10:00:00+07:00',
  invitation: {
    timeZone: 'Asia/Ho_Chi_Minh',
    guests: [{ email: 'guest@example.test', optional: true }],
  },
};
const existing = {
  provider: 'microsoft',
  external_calendar_id: source.externalCalendarId,
  external_event_id: 'event/a+b=',
};
beforeEach(() => {
  vi.clearAllMocks();
  const chain: any = {
    header: vi.fn(),
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  };
  chain.header.mockReturnValue(chain);
  mocks.api.mockReturnValue(chain);
  mocks.post.mockResolvedValue({ id: 'created' });
});
it('creates Outlook invitations with encoded calendar ids, UTC instants and optional guests', async () => {
  await createProviderEvent({ source, event });
  expect(mocks.api).toHaveBeenCalledWith(
    '/me/calendars/calendar%2Fa%2Bb%3D/events'
  );
  expect(mocks.post).toHaveBeenCalledWith(
    expect.objectContaining({
      start: { dateTime: '2026-10-07T02:00:00.000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-07T03:00:00.000', timeZone: 'UTC' },
      responseRequested: true,
      attendees: [
        {
          emailAddress: {
            address: 'guest@example.test',
            name: 'guest@example.test',
          },
          type: 'optional',
        },
      ],
    })
  );
});
it('updates and deletes the same encoded Outlook event identity', async () => {
  await updateProviderEvent({ source, existingEvent: existing, event });
  await deleteProviderEvent({ source, existingEvent: existing });
  expect(mocks.api.mock.calls.map(([path]) => path)).toEqual(
    Array(2).fill('/me/calendars/calendar%2Fa%2Bb%3D/events/event%2Fa%2Bb%3D')
  );
});
