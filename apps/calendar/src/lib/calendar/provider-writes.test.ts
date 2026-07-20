import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleDeleteMock } = vi.hoisted(() => ({
  googleDeleteMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function OAuth2Client(this: {
    setCredentials: (tokens: unknown) => void;
  }) {
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: vi.fn(() => ({
      events: { delete: googleDeleteMock },
    })),
  },
}));

vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: vi.fn(),
}));

import {
  deleteProviderEvent,
  isProviderEventAlreadyDeletedError,
} from './provider-writes';

const googleSource = {
  accessRole: 'owner',
  accessToken: 'access-token',
  accountEmail: 'person@example.com',
  accountName: 'Person',
  color: '#4285f4',
  connectionId: 'connection-id',
  externalCalendarId: 'primary',
  label: 'Primary',
  provider: 'google' as const,
  refreshToken: 'refresh-token',
  workspaceCalendarId: 'workspace-calendar-id',
};

const existingGoogleEvent = {
  external_calendar_id: 'primary',
  external_event_id: 'event-id',
  provider: 'google',
};

describe('isProviderEventAlreadyDeletedError', () => {
  it.each([
    { code: 410, message: 'Resource has been deleted' },
    { response: { status: 404 } },
    { statusCode: '404' },
    { cause: { status: 410 } },
  ])('accepts an already-absent provider event error', (error) => {
    expect(isProviderEventAlreadyDeletedError(error)).toBe(true);
  });

  it.each([{ code: 401 }, { response: { status: 403 } }, new Error('failed')])(
    'does not hide actionable provider failures',
    (error) => {
      expect(isProviderEventAlreadyDeletedError(error)).toBe(false);
    }
  );
});

describe('deleteProviderEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a Google 410 tombstone as an idempotent deletion', async () => {
    googleDeleteMock.mockRejectedValueOnce({
      code: 410,
      message: 'Resource has been deleted',
    });

    await expect(
      deleteProviderEvent({
        existingEvent: existingGoogleEvent,
        source: googleSource,
      })
    ).resolves.toBeUndefined();
  });

  it('preserves actionable Google provider failures', async () => {
    const error = { code: 403, message: 'Forbidden' };
    googleDeleteMock.mockRejectedValueOnce(error);

    await expect(
      deleteProviderEvent({
        existingEvent: existingGoogleEvent,
        source: googleSource,
      })
    ).rejects.toBe(error);
  });
});
