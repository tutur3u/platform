import type { calendar_v3 } from '@tuturuuu/google';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  colors: vi.fn(),
  entry: vi.fn(),
  details: vi.fn(),
  scope: vi.fn(),
  token: vi.fn(),
  rpc: vi.fn(),
  credentials: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: class {
    setCredentials = mocks.credentials;
  },
  google: {
    calendar: () => ({
      events: { list: mocks.list },
      colors: { get: mocks.colors },
      calendarList: { get: mocks.entry },
      calendars: { get: mocks.details },
    }),
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: mocks.scope }) }),
  }),
}));
vi.mock('../src/calendar-sync-coordination', () => ({
  updateLastUpsert: async () => {},
}));

import { performFullSyncForWorkspace } from '../src/google-calendar-full-sync';
import { performIncrementalSyncForWorkspace } from '../src/google-calendar-incremental-sync';

const workspace = '33333333-3333-4333-8333-333333333333';
const token = '22222222-2222-4222-8222-222222222222';
const capture = '11111111-1111-4111-8111-111111111111';
const source = 'selected@group.calendar.google.com';
const event = (id: string, extra: Partial<calendar_v3.Schema$Event> = {}) => ({
  id,
  summary: id,
  start: { dateTime: '2026-09-30T10:00:00Z' },
  end: { dateTime: '2026-09-30T11:00:00Z' },
  ...extra,
});
const applies = () =>
  mocks.rpc.mock.calls.filter(
    ([name]) => name === 'apply_calendar_google_import'
  );
const rows = () => applies()[0]?.[1].p_events;
const tokenWrites = () =>
  mocks.rpc.mock.calls.filter(
    ([name, args]) =>
      name === 'atomic_sync_token_operation' && args.p_operation === 'update'
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockImplementation(() => ({
    eq: mocks.scope,
    limit: mocks.token,
  }));
  mocks.token.mockResolvedValue({ data: [{ id: token }], error: null });
  mocks.colors.mockResolvedValue({
    data: {
      event: { '7': { background: '#039be5', foreground: '#ffffff' } },
      calendar: { '3': { background: '#7bd148', foreground: '#000000' } },
    },
  });
  mocks.entry.mockResolvedValue({
    data: {
      colorId: '3',
      backgroundColor: '#F691B2',
      foregroundColor: '#000000',
    },
  });
  mocks.details.mockResolvedValue({
    data: {
      labelProperties: {
        eventLabels: [
          { id: 'calendar-label-uuid', backgroundColor: '#D06B64' },
        ],
      },
    },
  });
  mocks.list.mockResolvedValue({
    data: {
      items: [
        event('inherited'),
        event('palette', { colorId: '7' }),
        event('label', {
          colorId: '7',
          eventLabelId: 'calendar-label-uuid',
          eventType: 'workingLocation',
          workingLocationProperties: {
            type: 'customLocation',
            customLocation: { label: 'Studio' },
          },
        }),
      ],
      nextSyncToken: 'next-token',
    },
  });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'list_deferred_calendar_google_imports')
      return { data: [], error: null };
    if (name === 'capture_calendar_google_import')
      return {
        data: {
          id: capture,
          wsId: args.p_ws_id,
          calendarId: args.p_calendar_id,
          authTokenId: args.p_auth_token_id,
        },
        error: null,
      };
    if (name === 'apply_calendar_google_import')
      return {
        data: {
          inserted: args.p_events.length,
          updated: 0,
          deleted: args.p_tombstones.length,
          deferred: 0,
        },
        error: null,
      };
    return { data: [{ success: true, sync_token: 'old-token' }], error: null };
  });
});
for (const [mode, sync] of [
  ['full', performFullSyncForWorkspace],
  ['incremental', performIncrementalSyncForWorkspace],
] as const) {
  describe(`${mode} guarded orchestrator and DB payload`, () => {
    it('imports selected RGB, palette and calendar labels through the captured scope', async () => {
      await sync(source, workspace, 'access', 'refresh');
      expect(mocks.credentials).toHaveBeenCalledWith({
        access_token: 'access',
        refresh_token: 'refresh',
      });
      expect(mocks.colors).toHaveBeenCalledWith();
      expect(mocks.entry).toHaveBeenCalledWith({ calendarId: source });
      expect(mocks.details).toHaveBeenCalledWith({ calendarId: source });
      expect(mocks.scope.mock.calls).toEqual([
        ['ws_id', workspace],
        ['provider', 'google'],
        ['is_active', true],
        ['access_token', 'access'],
      ]);
      expect(mocks.token).toHaveBeenCalledWith(2);
      expect(rows()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            external_calendar_id: source,
            google_calendar_id: source,
            scheduling_metadata: {
              google_color: expect.objectContaining({
                calendar_id: source,
                inherited: true,
                background: '#f691b2',
                resolution: 'calendar',
              }),
            },
          }),
          expect.objectContaining({
            scheduling_metadata: {
              google_color: expect.objectContaining({
                color_id: '7',
                inherited: false,
                background: '#039be5',
                resolution: 'event',
              }),
            },
          }),
          expect.objectContaining({
            scheduling_metadata: expect.objectContaining({
              google_working_location_label: 'Studio',
              google_color: expect.objectContaining({
                event_label_id: 'calendar-label-uuid',
                background: '#d06b64',
                resolution: 'label',
              }),
            }),
          }),
        ])
      );
      expect(applies()[0]?.[1]).toMatchObject({
        p_capture_id: capture,
        p_tombstones: [],
      });
      const captureIndex = mocks.rpc.mock.calls.findIndex(
        ([name]) => name === 'capture_calendar_google_import'
      );
      for (const read of [mocks.colors, mocks.entry, mocks.details, mocks.list])
        expect(mocks.rpc.mock.invocationCallOrder[captureIndex]).toBeLessThan(
          read.mock.invocationCallOrder[0]!
        );
      expect(tokenWrites()).toEqual([
        [
          'atomic_sync_token_operation',
          expect.objectContaining({
            p_calendar_id: source,
            p_sync_token: 'next-token',
          }),
        ],
      ]);
    });
    it('persists recurrence identity and original slot in the complete snapshot', async () => {
      mocks.list.mockResolvedValue({
        data: {
          items: [
            event('instance', {
              recurringEventId: 'series',
              originalStartTime: {
                dateTime: '2026-09-29T10:00:00Z',
                timeZone: 'Asia/Ho_Chi_Minh',
              },
              status: 'confirmed',
            }),
          ],
        },
      });
      await sync(source, workspace, 'access', 'refresh');
      expect(rows()[0].scheduling_metadata.google_recurrence).toEqual({
        version: 1,
        calendar_id: source,
        auth_token_id: token,
        recurring_event_id: 'series',
        original_start_time: {
          date_time: '2026-09-29T10:00:00Z',
          date: null,
          time_zone: 'Asia/Ho_Chi_Minh',
        },
        recurrence: null,
        status: 'confirmed',
      });
    });
    it('does not leave stale recurrence metadata on ordinary snapshots', async () => {
      await sync(source, workspace, 'access', 'refresh');
      expect(rows()[0].scheduling_metadata).not.toHaveProperty(
        'google_recurrence'
      );
    });
    it('uses calendar palette when custom source RGB is absent', async () => {
      mocks.entry.mockResolvedValue({ data: { colorId: '3' } });
      await sync(source, workspace, 'access', 'refresh');
      expect(rows()[0].scheduling_metadata.google_color.background).toBe(
        '#7bd148'
      );
    });
    it.each(['colors', 'entry', 'details'] as const)(
      'sends unresolved optional metadata to the guarded persistence boundary when %s fails',
      async (read) => {
        mocks[read].mockRejectedValue(new Error('provider unavailable'));
        await sync(source, workspace, 'access', 'refresh');
        const affected =
          read === 'entry'
            ? 'inherited'
            : read === 'colors'
              ? 'palette'
              : 'label';
        expect(
          rows().find(
            (row: { external_event_id: string }) =>
              row.external_event_id === affected
          ).scheduling_metadata.google_color
        ).toMatchObject({ background: null, resolution: 'unresolved' });
        expect(tokenWrites()).toHaveLength(1);
      }
    );
    it('blocks event reads and token advancement if pre-read capture fails', async () => {
      const original = mocks.rpc.getMockImplementation()!;
      mocks.rpc.mockImplementation((name, args) =>
        name === 'capture_calendar_google_import'
          ? Promise.resolve({ data: null, error: new Error('private detail') })
          : original(name, args)
      );
      await expect(
        sync(source, workspace, 'access', 'refresh')
      ).rejects.toThrow('Google import guard is unavailable');
      for (const read of [mocks.colors, mocks.entry, mocks.details, mocks.list])
        expect(read).not.toHaveBeenCalled();
      expect(applies()).toEqual([]);
      expect(tokenWrites()).toEqual([]);
    });
    it('does not advance the token after failed guarded persistence', async () => {
      const original = mocks.rpc.getMockImplementation()!;
      mocks.rpc.mockImplementation((name, args) =>
        name === 'apply_calendar_google_import'
          ? Promise.resolve({ data: null, error: new Error('private detail') })
          : original(name, args)
      );
      await expect(
        sync(source, workspace, 'access', 'refresh')
      ).rejects.toThrow('Google calendar batch sync failed');
      expect(tokenWrites()).toEqual([]);
    });
    it('passes canceled-event identity under the retained capture before token advancement', async () => {
      mocks.list.mockResolvedValue({
        data: {
          items: [event('cancelled', { status: 'cancelled' })],
          nextSyncToken: 'next-token',
        },
      });
      await sync(source, workspace, 'access', 'refresh');
      expect(applies()).toEqual([
        [
          'apply_calendar_google_import',
          { p_capture_id: capture, p_events: [], p_tombstones: ['cancelled'] },
        ],
      ]);
      const applyIndex = mocks.rpc.mock.calls.findIndex(
        ([name]) => name === 'apply_calendar_google_import'
      );
      const tokenIndex = mocks.rpc.mock.calls.findIndex(
        ([name, args]) =>
          name === 'atomic_sync_token_operation' &&
          args.p_operation === 'update'
      );
      expect(applyIndex).toBeLessThan(tokenIndex);
    });
    it('preserves unknown explicit identity without inventing a named fallback', async () => {
      mocks.list.mockResolvedValue({
        data: {
          items: [event('unknown', { colorId: 'future-color' })],
          nextSyncToken: 'next-token',
        },
      });
      await sync(source, workspace, 'access', 'refresh');
      expect(rows()[0].scheduling_metadata.google_color).toMatchObject({
        color_id: 'future-color',
        inherited: false,
        background: null,
        resolution: 'unresolved',
      });
    });
  });
}
