import { beforeEach, describe, expect, it, vi } from 'vitest';

const { googleDeleteMock, googleGetMock, googlePatchMock, googleInsertMock } =
  vi.hoisted(() => ({
    googleDeleteMock: vi.fn(),
    googleGetMock: vi.fn(),
    googlePatchMock: vi.fn(),
    googleInsertMock: vi.fn(),
  }));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function OAuth2Client(this: {
    setCredentials: (tokens: unknown) => void;
  }) {
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: vi.fn(() => ({
      events: {
        delete: googleDeleteMock,
        get: googleGetMock,
        patch: googlePatchMock,
        insert: googleInsertMock,
      },
    })),
  },
}));

vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: vi.fn(),
}));

import {
  createProviderEvent,
  deleteProviderEvent,
  isProviderEventAlreadyDeletedError,
  updateProviderEvent,
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

describe('Google color write preservation', () => {
  const event = {
    title: 'Updated title',
    start_at: '2026-09-30T07:00:00Z',
    end_at: '2026-09-30T08:00:00Z',
    color: 'BLUE' as const,
  };
  beforeEach(() => vi.clearAllMocks());
  it.each([{ colorId: '7' }, { colorId: '11' }, {}])(
    'preserves the live explicit or inherited color during title/time edits',
    async (data) => {
      googleGetMock.mockResolvedValueOnce({ data });
      await updateProviderEvent({
        source: googleSource,
        existingEvent: existingGoogleEvent,
        event,
      });
      const request = googlePatchMock.mock.calls[0]?.[0];
      expect(request.requestBody.colorId).toBe(data.colorId);
      expect(request).not.toHaveProperty('eventLabelVersion');
      expect(request.requestBody).not.toHaveProperty('eventLabelId');
    }
  );
  it('retains live labels using version1 even when the persisted row has no color metadata', async () => {
    googleGetMock.mockResolvedValueOnce({
      data: { colorId: '7', eventLabelId: 'live-label' },
    });
    await updateProviderEvent({
      source: googleSource,
      existingEvent: existingGoogleEvent,
      event,
    });
    expect(googlePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventLabelVersion: 1,
        requestBody: expect.objectContaining({
          eventLabelId: 'live-label',
          colorId: '7',
        }),
      }),
      undefined
    );
  });
  it('guards the preserved color against concurrent provider changes', async () => {
    googleGetMock.mockResolvedValueOnce({
      data: { colorId: '7', etag: 'current-etag' },
    });
    await updateProviderEvent({
      source: googleSource,
      existingEvent: existingGoogleEvent,
      event,
    });
    expect(googlePatchMock.mock.calls[0]?.[1]).toEqual({
      headers: { 'If-Match': 'current-etag' },
    });
  });
  it('does not patch when current provider identity cannot be read', async () => {
    googleGetMock.mockRejectedValueOnce(new Error('offline'));
    await expect(
      updateProviderEvent({
        source: googleSource,
        existingEvent: existingGoogleEvent,
        event,
      })
    ).rejects.toThrow('offline');
    expect(googlePatchMock).not.toHaveBeenCalled();
  });
  it('includes the native chosen color in deterministic insert payload and retry hash', async () => {
    googleInsertMock.mockResolvedValueOnce({ data: { id: 'event-id' } });
    await createProviderEvent({
      source: googleSource,
      event: { ...event, color: 'CYAN' },
      idempotencyKey: 'abc123',
    });
    expect(googleInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          colorId: '7',
          extendedProperties: {
            private: { tuturuuu_request_hash: expect.any(String) },
          },
        }),
      })
    );
  });
});
