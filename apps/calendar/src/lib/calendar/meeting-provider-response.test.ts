import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  api: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  google: {
    calendar: () => ({ events: { get: mocks.get, patch: mocks.patch } }),
  },
}));
vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: () => ({ api: mocks.api }),
}));
vi.mock('./provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));

import { respondToProviderMeeting } from './meeting-provider-response';

const source = {
  provider: 'google' as const,
  accountEmail: 'guest@example.com',
  accountName: 'Guest',
  externalCalendarId: 'primary',
  accessToken: 'test',
  accessRole: 'owner',
  connectionId: 'connection',
  workspaceCalendarId: null,
  label: 'Calendar',
  color: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({
    data: {
      etag: 'version-1',
      attendees: [
        { email: 'guest@example.com', self: true },
        { email: 'other@example.com' },
      ],
      organizer: { self: false },
    },
  });
  mocks.patch.mockResolvedValue({});
  mocks.post.mockResolvedValue(undefined);
  const chain = {
    header: vi.fn(),
    select: vi.fn(),
    get: mocks.get,
    post: mocks.post,
  };
  chain.header.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  mocks.api.mockReturnValue(chain);
});

describe('provider meeting replies', () => {
  it.each(['accepted', 'declined', 'tentative'] as const)(
    'Google sends only the current guest %s response',
    async (response) => {
      await respondToProviderMeeting({
        source,
        externalEventId: 'event',
        response,
      });
      expect(mocks.patch).toHaveBeenCalledWith(
        {
          calendarId: 'primary',
          eventId: 'event',
          sendUpdates: 'all',
          requestBody: {
            attendeesOmitted: true,
            attendees: [
              { email: 'guest@example.com', responseStatus: response },
            ],
          },
        },
        { headers: { 'If-Match': 'version-1' } }
      );
    }
  );
  it.each([
    {
      status: 'cancelled',
      attendees: [{ email: 'guest@example.com', self: true }],
    },
    { attendees: [{ email: 'another@example.com', self: true }] },
    { attendees: [{ email: 'guest@example.com', self: false }] },
    {
      organizer: { self: true },
      attendees: [{ email: 'guest@example.com', self: true }],
    },
  ])(
    'rejects cancelled meetings, organizer replies and another account',
    async (event) => {
      mocks.get.mockResolvedValueOnce({ data: event });
      await expect(
        respondToProviderMeeting({
          source,
          externalEventId: 'event',
          response: 'accepted',
        })
      ).rejects.toMatchObject({ status: expect.any(Number) });
      expect(mocks.patch).not.toHaveBeenCalled();
    }
  );
  it('does not retry a stale Google event and overwrite newer details', async () => {
    mocks.patch.mockRejectedValueOnce({ status: 412 });
    await expect(
      respondToProviderMeeting({
        source,
        externalEventId: 'event',
        response: 'accepted',
      })
    ).rejects.toMatchObject({ status: 412 });
    expect(mocks.patch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['accepted', 'accept'],
    ['declined', 'decline'],
    ['tentative', 'tentativelyAccept'],
  ] as const)(
    'Outlook %s sends an explicit organizer response',
    async (response, action) => {
      mocks.get.mockResolvedValueOnce({
        isOrganizer: false,
        isCancelled: false,
        attendees: [{ emailAddress: { address: 'guest@example.com' } }],
      });
      await respondToProviderMeeting({
        source: { ...source, provider: 'microsoft' },
        externalEventId: 'a/b',
        response,
      });
      expect(mocks.api).toHaveBeenCalledWith(`/me/events/a%2Fb/${action}`);
      expect(mocks.post).toHaveBeenCalledWith({ sendResponse: true });
    }
  );
  it('Outlook does not answer for an uninvited or delegated account', async () => {
    mocks.get.mockResolvedValueOnce({
      isOrganizer: false,
      isCancelled: false,
      attendees: [{ emailAddress: { address: 'another@example.com' } }],
    });
    await expect(
      respondToProviderMeeting({
        source: { ...source, provider: 'microsoft' },
        externalEventId: 'event',
        response: 'declined',
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('meeting response failure boundaries', () => {
  it.each([
    { provider: 'tuturuuu' as const, workspaceCalendarId: 'native-calendar' },
    { accessToken: '' },
    { accountEmail: null },
  ])(
    'rejects unavailable connected identities before contacting providers',
    async (override) => {
      await expect(
        respondToProviderMeeting({
          source: { ...source, ...override },
          externalEventId: 'event',
          response: 'accepted',
        })
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.patch).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
    }
  );

  it.each(['google', 'microsoft'] as const)(
    '%s preserves an authentication or provider outage without submitting a reply',
    async (provider) => {
      const error = new Error('Provider unavailable');
      mocks.get.mockRejectedValueOnce(error);
      await expect(
        respondToProviderMeeting({
          source: { ...source, provider },
          externalEventId: 'event',
          response: 'accepted',
        })
      ).rejects.toBe(error);
      expect(mocks.patch).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      isCancelled: true,
      attendees: [{ emailAddress: { address: 'guest@example.com' } }],
    },
    {
      isOrganizer: true,
      attendees: [{ emailAddress: { address: 'guest@example.com' } }],
    },
    { attendees: [] },
    {},
  ])(
    'Outlook refuses cancelled, organizer, and missing guest responses',
    async (event) => {
      mocks.get.mockResolvedValueOnce(event);
      await expect(
        respondToProviderMeeting({
          source: { ...source, provider: 'microsoft' },
          externalEventId: 'event',
          response: 'tentative',
        })
      ).rejects.toMatchObject({ status: expect.any(Number) });
      expect(mocks.post).not.toHaveBeenCalled();
    }
  );

  it('Outlook does not replay an ambiguous failed response', async () => {
    mocks.get.mockResolvedValueOnce({
      attendees: [{ emailAddress: { address: 'GUEST@EXAMPLE.COM' } }],
    });
    const error = new Error('Connection lost after response');
    mocks.post.mockRejectedValueOnce(error);
    await expect(
      respondToProviderMeeting({
        source: { ...source, provider: 'microsoft' },
        externalEventId: 'event',
        response: 'accepted',
      })
    ).rejects.toBe(error);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('Google matches email case while preserving the provider guest identity', async () => {
    mocks.get.mockResolvedValueOnce({
      data: { attendees: [{ email: 'GUEST@EXAMPLE.COM', self: true }] },
    });
    await respondToProviderMeeting({
      source,
      externalEventId: 'event',
      response: 'declined',
    });
    expect(mocks.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          attendeesOmitted: true,
          attendees: [
            { email: 'GUEST@EXAMPLE.COM', responseStatus: 'declined' },
          ],
        },
      }),
      undefined
    );
  });
});
