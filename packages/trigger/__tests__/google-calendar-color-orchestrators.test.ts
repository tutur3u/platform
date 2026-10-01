import type { calendar_v3 } from '@tuturuuu/google';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  colors: vi.fn(),
  entry: vi.fn(),
  details: vi.fn(),
  scope: vi.fn(),
  existing: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
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
    from: () => ({
      upsert: mocks.upsert,
      delete: () => ({ or: mocks.remove }),
      select: () => ({ eq: mocks.scope }),
    }),
  }),
}));
vi.mock('../src/calendar-sync-coordination', () => ({
  updateLastUpsert: async () => {},
}));

import { performFullSyncForWorkspace } from '../src/google-calendar-full-sync';
import { performIncrementalSyncForWorkspace } from '../src/google-calendar-incremental-sync';

const source = 'selected@group.calendar.google.com';
const event = (id: string, extra: Partial<calendar_v3.Schema$Event> = {}) => ({
  id,
  summary: id,
  start: { dateTime: '2026-09-30T10:00:00Z' },
  end: { dateTime: '2026-09-30T11:00:00Z' },
  ...extra,
});
const tokenWrites = () =>
  mocks.rpc.mock.calls.filter(([, args]) => args.p_operation === 'update');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockImplementation(() => ({
    eq: mocks.scope,
    in: mocks.existing,
  }));
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
  mocks.existing.mockResolvedValue({ data: [], error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({
    data: [{ success: true, sync_token: 'old-token' }],
    error: null,
  });
});

for (const [mode, sync] of [
  ['full', performFullSyncForWorkspace],
  ['incremental', performIncrementalSyncForWorkspace],
] as const) {
  describe(`${mode} actual orchestrator and DB payload`, () => {
    it('imports selected calendar RGB, live palette and calendar labels', async () => {
      await sync(source, 'workspace', 'access', 'refresh');
      expect(mocks.credentials).toHaveBeenCalledWith({
        access_token: 'access',
        refresh_token: 'refresh',
      });
      expect(mocks.colors).toHaveBeenCalledWith();
      expect(mocks.entry).toHaveBeenCalledWith({ calendarId: source });
      expect(mocks.details).toHaveBeenCalledWith({ calendarId: source });
      expect(mocks.scope.mock.calls).toEqual([
        ['ws_id', 'workspace'],
        ['provider', 'google'],
        ['external_calendar_id', source],
      ]);
      const rows = mocks.upsert.mock.calls[0]?.[0];
      expect(rows).toEqual(
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
      expect(mocks.upsert).toHaveBeenCalledWith(rows, {
        onConflict: 'ws_id,provider,external_calendar_id,external_event_id',
        ignoreDuplicates: false,
      });
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

    it('uses calendar palette only when custom source RGB is absent', async () => {
      mocks.entry.mockResolvedValue({ data: { colorId: '3' } });
      await sync(source, 'workspace', 'access', 'refresh');
      expect(
        mocks.upsert.mock.calls[0]?.[0][0].scheduling_metadata.google_color
          .background
      ).toBe('#7bd148');
    });

    it.each(['colors', 'entry', 'details'] as const)(
      'continues syncing with matching known metadata when %s fails',
      async (read) => {
        const affected =
          read === 'entry'
            ? 'inherited'
            : read === 'colors'
              ? 'palette'
              : 'label';
        const id = affected === 'label' ? 'calendar-label-uuid' : null;
        mocks.existing.mockResolvedValue({
          data: [
            {
              external_event_id: affected,
              scheduling_metadata: {
                custom: { retained: true },
                google_color: {
                  version: 1,
                  calendar_id: source,
                  color_id: affected === 'inherited' ? null : '7',
                  event_label_id: id,
                  inherited: affected === 'inherited',
                  background: '#123456',
                  foreground: '#ffffff',
                  resolution:
                    affected === 'inherited'
                      ? 'calendar'
                      : affected === 'palette'
                        ? 'event'
                        : 'label',
                },
              },
            },
          ],
          error: null,
        });
        mocks[read].mockRejectedValue(new Error('provider unavailable'));
        await sync(source, 'workspace', 'access', 'refresh');
        const row = mocks.upsert.mock.calls[0]?.[0].find(
          (entry: { external_event_id: string }) =>
            entry.external_event_id === affected
        );
        expect(row.scheduling_metadata).toMatchObject({
          custom: { retained: true },
          google_color: { background: '#123456' },
        });
        expect(tokenWrites()).toHaveLength(1);
      }
    );

    it('continues with all optional metadata reads unavailable and clears stale working location', async () => {
      mocks.colors.mockRejectedValue(new Error('unavailable'));
      mocks.entry.mockRejectedValue(new Error('unavailable'));
      mocks.details.mockRejectedValue(new Error('unavailable'));
      mocks.list.mockResolvedValue({
        data: { items: [event('inherited')], nextSyncToken: 'next-token' },
      });
      mocks.existing.mockResolvedValue({
        data: [
          {
            external_event_id: 'inherited',
            scheduling_metadata: {
              custom: { retained: true },
              google_working_location_label: 'Old office',
              google_event_type: 'workingLocation',
              google_color: {
                version: 1,
                calendar_id: source,
                color_id: null,
                event_label_id: null,
                inherited: true,
                background: '#abcdef',
                foreground: '#000000',
                resolution: 'calendar',
              },
            },
          },
        ],
        error: null,
      });
      await sync(source, 'workspace', 'access', 'refresh');
      expect(mocks.upsert.mock.calls[0]?.[0][0].scheduling_metadata).toEqual({
        custom: { retained: true },
        google_color: expect.objectContaining({
          background: '#abcdef',
          inherited: true,
        }),
      });
      expect(tokenWrites()).toHaveLength(1);
    });

    it('does not mutate known metadata or advance token when preservation read fails', async () => {
      mocks.existing.mockResolvedValue({
        data: null,
        error: new Error('metadata read unavailable'),
      });
      await expect(
        sync(source, 'workspace', 'access', 'refresh')
      ).rejects.toThrow('metadata read unavailable');
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(tokenWrites()).toEqual([]);
    });

    it('does not advance token after a failed upsert batch', async () => {
      mocks.upsert.mockResolvedValue({
        error: new Error('database unavailable'),
      });
      await expect(
        sync(source, 'workspace', 'access', 'refresh')
      ).rejects.toThrow('database unavailable');
      expect(tokenWrites()).toEqual([]);
    });

    it('scopes canceled-event deletion and blocks token advancement on delete failure', async () => {
      mocks.list.mockResolvedValue({
        data: {
          items: [event('cancelled', { status: 'cancelled' })],
          nextSyncToken: 'next-token',
        },
      });
      mocks.remove.mockResolvedValue({
        error: new Error('delete unavailable'),
      });
      await expect(
        sync(source, 'workspace', 'access', 'refresh')
      ).rejects.toThrow('delete unavailable');
      expect(mocks.remove).toHaveBeenCalledWith(
        expect.stringContaining(`external_calendar_id.eq.${source}`)
      );
      expect(tokenWrites()).toEqual([]);
    });

    it('preserves unknown explicit identity without inventing a named fallback', async () => {
      mocks.existing.mockResolvedValue({
        data: [
          {
            external_event_id: 'unknown',
            scheduling_metadata: {
              google_color: {
                version: 1,
                calendar_id: source,
                color_id: '7',
                event_label_id: null,
                inherited: false,
                background: '#123456',
                resolution: 'event',
              },
            },
          },
        ],
        error: null,
      });
      mocks.list.mockResolvedValue({
        data: {
          items: [event('unknown', { colorId: 'future-color' })],
          nextSyncToken: 'next-token',
        },
      });
      await sync(source, 'workspace', 'access', 'refresh');
      expect(
        mocks.upsert.mock.calls[0]?.[0][0].scheduling_metadata.google_color
      ).toMatchObject({
        color_id: 'future-color',
        inherited: false,
        background: null,
        resolution: 'unresolved',
      });
    });
  });
}
