import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  list: vi.fn(),
  order: [] as string[],
}));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
  google: { calendar: () => ({ events: { list: m.list } }) },
}));
vi.mock('../src/google-calendar-color-context', () => ({
  getGoogleCalendarColorContext: async () => {
    m.order.push(
      'provider-palette',
      'provider-calendar-entry',
      'provider-calendar-details'
    );
    return {};
  },
}));
vi.mock('../src/calendar-sync-coordination', () => ({
  updateLastUpsert: async () => {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: m.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: async () => ({
          data: [{ id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }],
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { performFullSyncForWorkspace } from '../src/google-calendar-full-sync';
import { performIncrementalSyncForWorkspace } from '../src/google-calendar-incremental-sync';

const wsId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const capture = {
  id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
  wsId,
  calendarId: 'selected',
  authTokenId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
};
const item = {
  id: 'event',
  start: { dateTime: '2026-10-01T10:00:00Z' },
  end: { dateTime: '2026-10-01T11:00:00Z' },
};
beforeEach(() => {
  vi.resetAllMocks();
  m.order.length = 0;
  m.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      m.order.push(args.p_operation === 'update' ? 'token' : name);
      const data =
        name === 'capture_calendar_google_import'
          ? capture
          : name === 'list_deferred_calendar_google_imports'
            ? []
            : name === 'apply_calendar_google_import'
              ? { inserted: 0, updated: 0, deleted: 0, deferred: 1 }
              : [{ success: true, sync_token: 'old' }];
      return { data, error: null };
    }
  );
  m.list.mockImplementation(async () => {
    m.order.push('provider-list');
    return { data: { items: [item], nextSyncToken: 'next' } };
  });
});

for (const [label, sync] of [
  ['incremental', performIncrementalSyncForWorkspace],
  ['full', performFullSyncForWorkspace],
] as const) {
  describe(`${label} guarded import orchestration`, () => {
    it('captures before provider read and commits deferral before advancing token', async () => {
      await sync('selected', wsId, 'fixture-access', 'fixture-refresh');
      for (const read of [
        'provider-palette',
        'provider-calendar-entry',
        'provider-calendar-details',
        'provider-list',
      ])
        expect(m.order.indexOf('capture_calendar_google_import')).toBeLessThan(
          m.order.indexOf(read)
        );
      expect(m.order.indexOf('apply_calendar_google_import')).toBeLessThan(
        m.order.indexOf('token')
      );
      expect(
        m.rpc.mock.calls.find(
          ([name]) => name === 'apply_calendar_google_import'
        )?.[1].p_capture_id
      ).toBe(capture.id);
    });
    it('retains the old token when durable apply fails', async () => {
      const original = m.rpc.getMockImplementation()!;
      m.rpc.mockImplementation(async (name, args) =>
        name === 'apply_calendar_google_import'
          ? { data: null, error: { code: '40001' } }
          : original(name, args)
      );
      await expect(
        sync('selected', wsId, 'fixture-access', 'fixture-refresh')
      ).rejects.toThrow();
      expect(m.order).not.toContain('token');
    });
    it('does not read provider events when capture fails', async () => {
      const original = m.rpc.getMockImplementation()!;
      m.rpc.mockImplementation(async (name, args) =>
        name === 'capture_calendar_google_import'
          ? { data: null, error: { code: '42501' } }
          : original(name, args)
      );
      await expect(
        sync('selected', wsId, 'fixture-access', 'fixture-refresh')
      ).rejects.toThrow();
      expect(m.list).not.toHaveBeenCalled();
      expect(m.order.some((read) => read.startsWith('provider-'))).toBe(false);
    });
  });
}
