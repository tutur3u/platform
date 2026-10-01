import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleColorOperationProvider } from './google-provider';
import type { ColorOperation } from './protocol';

const operation: ColorOperation = {
  id: 'operation-A',
  generation: '1',
  requestHash: 'request-hash',
  phase: 'reserved',
  prepared: null,
  identity: {
    wsId: 'workspace',
    eventId: 'local',
    connectionId: 'connection',
    authTokenId: 'token',
    calendarId: 'calendar',
    providerEventId: 'google',
  },
  intent: { connectionId: 'connection', kind: 'event', id: '11' },
};
function fixture() {
  const get = vi.fn().mockResolvedValue({
    data: {
      etag: 'opaque:not-sortable',
      colorId: '7',
      extendedProperties: {
        private: { unrelated: 'keep', tuturuuuColorOperation: 'operation-B' },
      },
    },
  });
  const patch = vi.fn().mockResolvedValue({ data: {} });
  const calendar = {
    events: { get, patch },
    colors: {
      get: vi.fn().mockResolvedValue({
        data: {
          event: {
            '7': { background: '#00ff88' },
            '11': { background: '#ffffff' },
          },
        },
      }),
    },
    calendarList: {
      get: vi.fn().mockResolvedValue({
        data: {
          backgroundColor: '#aabbcc',
          foregroundColor: '#000000',
          accessRole: 'writer',
        },
      }),
    },
    calendars: { get: vi.fn().mockResolvedValue({ data: {} }) },
  } as unknown as calendar_v3.Calendar;
  const source = {
    provider: 'google' as const,
    connectionId: 'connection',
    externalCalendarId: 'calendar',
    workspaceCalendarId: null,
    accessRole: 'writer',
    accountEmail: null,
    accountName: null,
    label: 'source',
    color: '#aabbcc',
  };
  const resolve = vi.fn(async () => ({
    calendar,
    source,
    verifiedAuthTokenId: 'token',
  }));
  return {
    provider: createGoogleColorOperationProvider(resolve),
    get,
    patch,
    resolve,
  };
}

describe('real Google operation adapter', () => {
  it('prepares actual provider choice and preserves unrelated private properties', async () => {
    const f = fixture();
    const prepared = await f.provider.prepare(operation);
    expect(prepared).toEqual({
      baseETag: 'opaque:not-sortable',
      eventLabelVersion: 0,
      patch: {
        colorId: '11',
        eventLabelId: '',
        extendedProperties: {
          private: {
            unrelated: 'keep',
            tuturuuuColorOperation: 'operation-B',
          },
        },
      },
    });
    expect(f.patch).not.toHaveBeenCalled();
  });
  it('replays the persisted patch and immutable ETag without another provider read', async () => {
    const f = fixture();
    const prepared = await f.provider.prepare(operation);
    await f.provider.patch(operation.identity, prepared);
    await f.provider.patch(operation.identity, prepared);
    expect(f.get).toHaveBeenCalledTimes(1);
    for (const call of f.patch.mock.calls) {
      expect(call).toEqual([
        {
          calendarId: 'calendar',
          eventId: 'google',
          eventLabelVersion: 0,
          sendUpdates: 'none',
          requestBody: prepared.patch,
        },
        { headers: { 'If-Match': 'opaque:not-sortable' } },
      ]);
    }
  });
  it('reads actual current provider RGB and operation marker for reconciliation', async () => {
    const f = fixture();
    expect(await f.provider.read(operation.identity)).toMatchObject({
      etag: 'opaque:not-sortable',
      operationMarker: 'operation-B',
      compatibilityColor: 'CYAN',
      metadata: {
        google_color: {
          color_id: '7',
          inherited: false,
          background: '#00ff88',
        },
      },
    });
  });
  it('verifies exact token/connection/calendar identity before touching Google', async () => {
    for (const identity of [
      { ...operation.identity, authTokenId: 'forged' },
      { ...operation.identity, connectionId: 'forged' },
      { ...operation.identity, calendarId: 'forged' },
    ]) {
      const f = fixture();
      await expect(f.provider.read(identity)).rejects.toThrow('source changed');
      expect(f.get).not.toHaveBeenCalled();
    }
  });
  it('recognizes only actual precondition errors without swallowing provider failures', () => {
    const f = fixture();
    expect(f.provider.isPreconditionFailure({ code: 412 })).toBe(true);
    expect(
      f.provider.isPreconditionFailure({ response: { status: 412 } })
    ).toBe(true);
    expect(f.provider.isPreconditionFailure({ code: 500 })).toBe(false);
    expect(
      f.provider.isPreconditionFailure(new Error('412 in a message'))
    ).toBe(false);
  });
});
