import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { calendarEventColors } from '@tuturuuu/utils/calendar-event-colors';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: null as TypedSupabaseClient | null,
  allowed: true,
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: async () =>
    state.allowed
      ? { sbAdmin: state.admin, wsId: 'workspace', userId: 'actor' }
      : { error: Response.json({ error: 'Denied' }, { status: 403 }) },
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createProviderEvent: vi.fn(),
  updateProviderEvent: vi.fn(),
  moveProviderEvent: vi.fn(),
  deleteProviderEvent: vi.fn(),
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: vi.fn(),
  resolveCalendarSourceForEvent: vi.fn(),
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: vi.fn(),
  resolveOutboundSyncSource: vi.fn(),
}));
vi.mock('@/lib/calendar/create-invited-meeting', () => ({
  createInvitedMeeting: vi.fn(),
  MeetingCreateError: class extends Error {},
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventsFromStorage: async (events: unknown) => events,
  decryptEventFromStorage: async (event: unknown) => event,
  encryptEventForStorage: vi.fn(),
  getWorkspaceKey: vi.fn(),
}));
vi.mock('@/lib/calendar/event-deduplication', () => ({
  deduplicateCalendarEvents: (events: unknown) => events,
}));
vi.mock('@/lib/calendar/habit-skips', () => ({ upsertHabitSkip: vi.fn() }));

import { GET as ITEM } from '@/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route';
import { GET as LIST } from '@/app/api/v1/workspaces/[wsId]/calendar/events/route';

function fixture(errorTable?: string) {
  const event = {
    id: 'event',
    provider: 'google',
    external_calendar_id: 'source',
    source_calendar_id: 'linked-source',
    color: 'BLUE',
    scheduling_metadata: {
      google_color: { version: 1, inherited: true, background: '#abcdef' },
    },
  };
  let sourceColor = '#ff80ab';
  const queries: { table: string; eq: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const data =
      table === 'workspace_calendar_events'
        ? [event]
        : table === 'calendar_auth_tokens'
          ? [{ id: 'owned-token' }]
          : [
              {
                calendar_id: 'source',
                workspace_calendar_id: 'linked-source',
                color: sourceColor,
              },
            ];
    const query = Object.assign(
      Promise.resolve({
        data,
        error:
          table === errorTable ? { message: 'private-provider-detail' } : null,
      }),
      {
        select: vi.fn(),
        eq: vi.fn(),
        lt: vi.fn(),
        gt: vi.fn(),
        order: vi.fn(),
        in: vi.fn(),
        limit: vi.fn(),
        single: async () => ({ data: event, error: null }),
      }
    );
    for (const key of [
      'select',
      'eq',
      'lt',
      'gt',
      'order',
      'in',
      'limit',
    ] as const)
      query[key].mockReturnValue(query);
    queries.push({ table, eq: query.eq });
    return query;
  });
  state.admin = { from } as unknown as TypedSupabaseClient;
  return {
    event,
    from,
    queries,
    setColor: (value: string) => {
      sourceColor = value;
    },
  };
}
beforeEach(() => {
  state.allowed = true;
});
const request = () =>
  new Request(
    'https://fixture.invalid/events?start_at=2026-10-01T00:00:00Z&end_at=2026-10-02T00:00:00Z'
  );
const params = () => ({
  params: Promise.resolve({ wsId: 'workspace', eventId: 'event' }),
});
it('joins refreshed owned source RGB on list and item reads without an event delta', async () => {
  const f = fixture();
  const first = await LIST(request(), params());
  expect(first.status).toBe(200);
  expect((await first.json()).data[0]._calendarColor).toBe('#ff80ab');
  f.setColor('#00ff88');
  const second = await ITEM(request(), params());
  expect(second.status).toBe(200);
  const item = await second.json();
  expect(item._calendarColor).toBe('#00ff88');
  expect(calendarEventColors(item).background).toBe('#00ff88');
  expect(item.scheduling_metadata).toEqual(f.event.scheduling_metadata);
  expect(
    f.queries
      .filter(({ table }) => table === 'calendar_auth_tokens')
      .every(({ eq }) =>
        eq.mock.calls.some(
          ([key, value]) => key === 'user_id' && value === 'actor'
        )
      )
  ).toBe(true);
});
it('denies both transports before account/source reads', async () => {
  const f = fixture();
  state.allowed = false;
  expect((await LIST(request(), params())).status).toBe(403);
  expect((await ITEM(request(), params())).status).toBe(403);
  expect(f.from).not.toHaveBeenCalled();
});

for (const table of ['calendar_auth_tokens', 'calendar_connections']) {
  it(`preserves successful list/item reads when optional ${table} lookup fails`, async () => {
    const f = fixture(table);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const list = await LIST(request(), params());
      expect(list.status).toBe(200);
      const item = await ITEM(request(), params());
      expect(item.status).toBe(200);
      const result = await item.json();
      expect(result.scheduling_metadata).toEqual(f.event.scheduling_metadata);
      expect(result).not.toHaveProperty('_calendarColor');
      expect((await list.json()).data[0].scheduling_metadata).toEqual(
        f.event.scheduling_metadata
      );
      expect(warn).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'private-provider-detail'
      );
      expect(warn).toHaveBeenCalledWith(
        'Calendar source color hydration unavailable',
        { stage: table === 'calendar_auth_tokens' ? 'accounts' : 'connections' }
      );
    } finally {
      warn.mockRestore();
    }
  });
}
