import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  move: vi.fn(),
  insert: vi.fn(),
  colors: vi.fn(),
  entry: vi.fn(),
  details: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function (this: { setCredentials: unknown }) {
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: vi.fn(() => ({
      events: {
        get: mocks.get,
        patch: mocks.patch,
        move: mocks.move,
        insert: mocks.insert,
      },
      colors: { get: mocks.colors },
      calendarList: { get: mocks.entry },
      calendars: { get: mocks.details },
    })),
  },
}));
vi.mock('@tuturuuu/microsoft', () => ({ createGraphClient: vi.fn() }));

import {
  createProviderEvent,
  moveProviderEvent,
  updateProviderEvent,
} from './provider-writes';

const connectionId = '00000000-0000-4000-8000-000000000001',
  labelId = '00000000-0000-4000-8000-000000000002';
const source = {
  provider: 'google' as const,
  connectionId,
  workspaceCalendarId: null,
  externalCalendarId: 'source',
  accessRole: 'owner',
  accountEmail: null,
  accountName: null,
  label: 'Source',
  color: null,
  accessToken: 'test',
};
const existing = {
  provider: 'google',
  external_calendar_id: 'source',
  external_event_id: 'event',
};
const event = {
  title: 'Unchanged',
  start_at: '2026-09-30T07:00:00Z',
  end_at: '2026-09-30T08:00:00Z',
};
describe('Google provider color-only write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      data: {
        id: 'event',
        etag: 'version',
        colorId: '9',
        eventLabelId: labelId,
      },
    });
    mocks.colors.mockResolvedValue({
      data: {
        event: {
          '7': { background: '#039be5' },
          '9': { background: '#123abc' },
        },
      },
    });
    mocks.entry.mockResolvedValue({
      data: { backgroundColor: '#d06b64', accessRole: 'owner' },
    });
    mocks.details.mockResolvedValue({
      data: {
        labelProperties: {
          eventLabels: [
            { id: labelId, backgroundColor: '#123abc', name: 'Custom' },
          ],
        },
      },
    });
    mocks.patch.mockResolvedValue({ data: { id: 'event' } });
    mocks.insert.mockResolvedValue({ data: { id: 'created' } });
    mocks.move.mockResolvedValue({ data: { id: 'moved' } });
  });
  it.each([
    {
      kind: 'event' as const,
      id: '7',
      fields: { colorId: '7' },
      version: 0,
      rgb: '#039be5',
    },
    {
      kind: 'label' as const,
      id: labelId,
      fields: { eventLabelId: labelId },
      version: 1,
      rgb: '#123abc',
    },
    {
      kind: 'inherit' as const,
      id: null,
      fields: { eventLabelId: '' },
      version: 1,
      rgb: '#d06b64',
    },
  ])('writes only validated color fields for $kind', async (choice) => {
    const result = await updateProviderEvent({
      source,
      existingEvent: existing,
      event: {
        ...event,
        providerColorOnly: true,
        providerColor: {
          connectionId,
          kind: choice.kind,
          id: choice.id,
        } as never,
      },
    });
    expect(mocks.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: 'none',
        eventLabelVersion: choice.version,
        requestBody: choice.fields,
      }),
      { headers: { 'If-Match': 'version' } }
    );
    expect(result?.googleColor?.background).toBe(choice.rgb);
    expect(mocks.patch.mock.calls[0]?.[0].requestBody).not.toHaveProperty(
      'summary'
    );
  });
  it('rejects stale choice before any mutation', async () => {
    await expect(
      updateProviderEvent({
        source,
        existingEvent: existing,
        event: {
          ...event,
          providerColor: { connectionId, kind: 'event', id: 'missing' },
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it('does not trust client metadata for unrelated edits', async () => {
    await updateProviderEvent({
      source,
      existingEvent: existing,
      event: {
        ...event,
        scheduling_metadata: { google_color: { event_label_id: 'attacker' } },
      } as never,
    });
    expect(mocks.patch.mock.calls[0]?.[0].requestBody.eventLabelId).toBe(
      labelId
    );
  });
  it('maps a concurrent provider change to a visible conflict without retrying', async () => {
    mocks.patch.mockRejectedValueOnce({ code: 412 });
    await expect(
      updateProviderEvent({
        source,
        existingEvent: existing,
        event: { ...event, providerColor: { connectionId, kind: 'inherit' } },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.patch).toHaveBeenCalledOnce();
  });
  it('surfaces a label deleted during validation as a choice conflict', async () => {
    mocks.patch.mockRejectedValueOnce({ code: 400 });
    await expect(
      updateProviderEvent({
        source,
        existingEvent: existing,
        event: {
          ...event,
          providerColor: { connectionId, kind: 'label', id: labelId },
        },
      })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects mismatched event/source identity before reading provider data', async () => {
    await expect(
      updateProviderEvent({
        source: { ...source, externalCalendarId: 'other' },
        existingEvent: existing,
        event: { ...event, providerColor: { connectionId, kind: 'inherit' } },
      })
    ).rejects.toThrow('does not belong');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('uses validated label identity in deterministic create payload', async () => {
    const result = await createProviderEvent({
      source,
      event: {
        ...event,
        providerColor: { connectionId, kind: 'label', id: labelId },
      },
      idempotencyKey: 'abc123',
    });
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
      eventLabelVersion: 1,
      requestBody: { eventLabelId: labelId },
    });
    expect(result?.googleColor?.event_label_id).toBe(labelId);
  });
  it('surfaces a label deleted during insertion as a conflict without retrying', async () => {
    mocks.insert.mockRejectedValueOnce({ code: 400 });
    await expect(
      createProviderEvent({
        source,
        event: {
          ...event,
          providerColor: { connectionId, kind: 'label', id: labelId },
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([
    { ...event },
    { ...event, color: 'BLUE' as const, nativeColorChange: true },
    {
      ...event,
      providerColor: {
        connectionId: 'target-connection',
        kind: 'inherit' as const,
      },
    },
  ])(
    'rejects label or color moves before a provider mutation',
    async (moveEvent) => {
      await expect(
        moveProviderEvent({
          fromSource: source,
          toSource: {
            ...source,
            connectionId: 'target-connection',
            externalCalendarId: 'target',
          },
          existingEvent: existing,
          event: moveEvent,
        })
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.move).not.toHaveBeenCalled();
      expect(mocks.patch).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );

  it('rejects a color-only move even when the current event has no label', async () => {
    mocks.get.mockResolvedValue({
      data: { id: 'event', etag: 'version', colorId: '9' },
    });
    await expect(
      moveProviderEvent({
        fromSource: source,
        toSource: {
          ...source,
          connectionId: 'target-connection',
          externalCalendarId: 'target',
        },
        existingEvent: existing,
        event: {
          ...event,
          providerColor: {
            connectionId: 'target-connection',
            kind: 'event',
            id: '7',
          },
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
