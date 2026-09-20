import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  api: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function (this: { setCredentials: () => void }) {
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: () => ({ events: { insert: mocks.insert, get: mocks.get } }),
  },
}));
vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: () => ({ api: mocks.api }),
}));

import { createProviderEvent } from './provider-writes';

const source = {
  provider: 'google' as const,
  connectionId: 'connection',
  workspaceCalendarId: null,
  externalCalendarId: 'primary',
  accessRole: 'owner',
  accountEmail: 'organizer@example.com',
  accountName: 'Organizer',
  accessToken: 'test',
  label: 'Primary',
  color: null,
};
const event = {
  title: 'Planning',
  description: '',
  location: '',
  start_at: '2026-11-01T01:30:00-04:00',
  end_at: '2026-11-01T02:30:00-05:00',
  invitation: {
    guests: [{ email: 'guest@example.com' }],
    timeZone: 'America/New_York',
  },
};
const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ data: { id: key.replaceAll('-', '') } });
  mocks.get.mockImplementation(async () => ({
    data: {
      id: key.replaceAll('-', ''),
      extendedProperties:
        mocks.insert.mock.calls.at(-1)?.[0].requestBody.extendedProperties,
    },
  }));
  mocks.post.mockResolvedValue({ id: 'graph-event' });
  const chain = { header: vi.fn(), post: mocks.post };
  chain.header.mockReturnValue(chain);
  mocks.api.mockReturnValue(chain);
});
describe('retry-safe invitation creation', () => {
  it('Google uses a stable provider ID and sends real guest invitations', async () => {
    await createProviderEvent({ source, event, idempotencyKey: key });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: 'all',
        requestBody: expect.objectContaining({
          id: key.replaceAll('-', ''),
          attendees: [
            {
              email: 'guest@example.com',
              displayName: undefined,
              optional: false,
            },
          ],
        }),
      })
    );
  });
  it('reconciles a Google duplicate without inserting a second event', async () => {
    mocks.insert.mockRejectedValueOnce({ code: 409 });
    const result = await createProviderEvent({
      source,
      event,
      idempotencyKey: key,
    });
    expect(result?.externalEventId).toBe(key.replaceAll('-', ''));
    expect(mocks.get).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: key.replaceAll('-', ''),
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 'another-request'])(
    'rejects a duplicate belonging to a different request (%s)',
    async (fingerprint) => {
      mocks.insert.mockRejectedValueOnce({ code: 409 });
      mocks.get.mockResolvedValueOnce({
        data: {
          id: key.replaceAll('-', ''),
          extendedProperties: {
            private: { tuturuuu_request_hash: fingerprint },
          },
        },
      });
      await expect(
        createProviderEvent({ source, event, idempotencyKey: key })
      ).rejects.toMatchObject({ code: 409 });
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    }
  );
  it.each([401, 403, 429, 503])(
    'does not mistake provider status %s for a completed request',
    async (code) => {
      mocks.insert.mockRejectedValueOnce({ code });
      await expect(
        createProviderEvent({ source, event, idempotencyKey: key })
      ).rejects.toMatchObject({ code });
      expect(mocks.get).not.toHaveBeenCalled();
    }
  );
  it('does not resurrect a cancelled Google invitation on retry', async () => {
    mocks.insert.mockRejectedValueOnce({ code: 409 });
    mocks.get.mockResolvedValueOnce({ data: { id: key, status: 'cancelled' } });
    await expect(
      createProviderEvent({ source, event, idempotencyKey: key })
    ).rejects.toMatchObject({ code: 409 });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it('Graph uses transactionId and preserves DST instants for invitation retries', async () => {
    await createProviderEvent({
      source: { ...source, provider: 'microsoft' },
      event,
      idempotencyKey: key,
    });
    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: key,
        responseRequested: true,
        start: { dateTime: '2026-11-01T05:30:00.000', timeZone: 'UTC' },
        end: { dateTime: '2026-11-01T07:30:00.000', timeZone: 'UTC' },
      })
    );
  });
});
