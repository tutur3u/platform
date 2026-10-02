import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), updated: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock('../src/calendar-sync-coordination', () => ({
  updateLastUpsert: mocks.updated,
}));
vi.mock('@tuturuuu/utils/calendar-utils', () => ({
  convertGoogleAllDayEvent: (start: string, end: string) => ({
    start_at: start,
    end_at: end,
  }),
}));
vi.mock('@tuturuuu/google', () => ({ OAuth2Client: vi.fn() }));

import {
  syncGoogleCalendarEventsForWorkspaceBatched,
  syncWorkspaceBatched,
} from '../src/google-calendar-sync';

const wsId = '33333333-3333-4333-8333-333333333333';
const capture = {
  id: '11111111-1111-4111-8111-111111111111',
  wsId,
  calendarId: 'selected',
  authTokenId: '22222222-2222-4222-8222-222222222222',
};
const event = (id: string, status = 'confirmed') => ({
  id,
  status,
  summary: id,
  colorId: '1',
  start: { dateTime: '2026-10-02T10:00:00Z' },
  end: { dateTime: '2026-10-02T11:00:00Z' },
});
const sync = (events: ReturnType<typeof event>[]) =>
  syncGoogleCalendarEventsForWorkspaceBatched(
    wsId,
    events,
    'selected',
    {},
    capture
  );
const calls = () =>
  mocks.rpc.mock.calls.map(([name, args]) => ({ name, args }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (_, args) => ({
    error: null,
    data: {
      inserted: args.p_events.length,
      updated: 0,
      deleted: args.p_tombstones.length,
      deferred: 0,
    },
  }));
});
describe('guarded Google batch persistence', () => {
  it('formats rows and sends the pre-read capture through the guarded RPC', async () => {
    expect(await sync([event('one')])).toEqual({
      ws_id: wsId,
      success: true,
      eventsSynced: 1,
      eventsDeleted: 0,
      eventsDeferred: 0,
    });
    expect(calls()).toEqual([
      {
        name: 'apply_calendar_google_import',
        args: {
          p_capture_id: capture.id,
          p_tombstones: [],
          p_events: [
            expect.objectContaining({
              ws_id: wsId,
              external_calendar_id: 'selected',
              external_event_id: 'one',
              title: 'one',
              color: 'INDIGO',
              start_at: '2026-10-02T10:00:00Z',
              locked: true,
              scheduling_metadata: {
                google_color: expect.objectContaining({
                  calendar_id: 'selected',
                  color_id: '1',
                  resolution: 'unresolved',
                }),
              },
            }),
          ],
        },
      },
    ]);
  });
  it('passes canceled identities as bound tombstones', async () => {
    const result = await sync([event('one', 'cancelled')]);
    expect(result.eventsDeleted).toBe(1);
    expect(calls()[0]?.args).toEqual({
      p_capture_id: capture.id,
      p_events: [],
      p_tombstones: ['one'],
    });
  });
  it('handles mixed events with separate guarded upsert and deletion batches', async () => {
    const result = await sync([
      event('one'),
      event('two', 'cancelled'),
      event('three'),
    ]);
    expect(result).toMatchObject({
      success: true,
      eventsSynced: 2,
      eventsDeleted: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not dispatch an empty batch', async () => {
    expect(await sync([])).toMatchObject({
      success: true,
      eventsSynced: 0,
      eventsDeleted: 0,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['upsert', 'delete'])(
    'does not mark a failed %s batch complete or expose raw database errors',
    async (kind) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: new Error('private database detail'),
      });
      expect(
        await sync([
          event('one', kind === 'delete' ? 'cancelled' : 'confirmed'),
        ])
      ).toEqual({
        ws_id: wsId,
        success: false,
        error: 'Google calendar batch sync failed',
      });
      expect(mocks.updated).not.toHaveBeenCalled();
    }
  );
  it('splits upserts at 100 rows without allocating a new capture', async () => {
    const result = await sync(
      Array.from({ length: 150 }, (_, i) => event(String(i)))
    );
    expect(result.eventsSynced).toBe(150);
    expect(calls().map(({ args }) => args.p_events.length)).toEqual([100, 50]);
    expect(calls().every(({ args }) => args.p_capture_id === capture.id)).toBe(
      true
    );
  });
  it('splits tombstones at 50 identities', async () => {
    expect(
      (
        await sync(
          Array.from({ length: 75 }, (_, i) => event(String(i), 'cancelled'))
        )
      ).eventsDeleted
    ).toBe(75);
    expect(calls().map(({ args }) => args.p_tombstones.length)).toEqual([
      50, 25,
    ]);
  });
  it('reports durable deferred entries separately from applied rows', async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { inserted: 0, updated: 1, deleted: 0, deferred: 1 },
    });
    expect(await sync([event('one'), event('two')])).toMatchObject({
      success: true,
      eventsSynced: 1,
      eventsDeferred: 1,
    });
    expect(mocks.updated).toHaveBeenCalledWith(wsId, expect.any(Object));
  });
  it('rejects a capture for another workspace before persistence', async () => {
    const result = await syncWorkspaceBatched({
      ws_id: 'another',
      events_to_sync: [event('one')],
      calendarId: 'selected',
      capture,
    });
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects a capture for another provider calendar before persistence', async () => {
    const result = await syncWorkspaceBatched({
      ws_id: wsId,
      events_to_sync: [event('one')],
      calendarId: 'other',
      capture,
    });
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('passes the supplied capture through the public batch wrapper', async () => {
    expect(
      (
        await syncWorkspaceBatched({
          ws_id: wsId,
          events_to_sync: [event('one')],
          calendarId: 'selected',
          capture,
        })
      ).success
    ).toBe(true);
    expect(calls()[0]?.args.p_capture_id).toBe(capture.id);
  });
});
