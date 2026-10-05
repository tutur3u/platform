import { describe, expect, it, vi } from 'vitest';
import { readTaskScheduleBatch } from './task-schedule-batch';

function fixture(overrides: Record<string, unknown> = {}) {
  const event = {
    id: 'event-1',
    ws_id: 'source',
    start_at: '2026-10-05T01:00:00Z',
    end_at: '2026-10-05T02:00:00Z',
  };
  const state: Record<string, unknown> = {
    context: { data: { type: 'MEMBER' }, error: null },
    personal: { data: { personal: true }, error: null },
    tasks: {
      data: [
        { id: 'task-1', task_lists: { workspace_boards: { ws_id: 'source' } } },
      ],
      error: null,
    },
    memberships: { data: [{ ws_id: 'source', type: 'MEMBER' }], error: null },
    settings: {
      data: [{ task_id: 'task-1', total_duration: 2, auto_schedule: true }],
      error: null,
    },
    linked: {
      data: [
        {
          task_id: 'task-1',
          event_id: event.id,
          workspace_calendar_events: event,
        },
      ],
      error: null,
    },
    direct: { data: [{ ...event, task_id: 'task-1' }], error: null },
    ...overrides,
  };
  const calls: Array<{ table: string; filters: Array<unknown> }> = [];
  function client() {
    return {
      from: vi.fn((table: string) => {
        const call = { table, filters: [] as unknown[] };
        calls.push(call);
        let rangeFrom = 0;
        const b: Record<string, unknown> = {};
        for (const op of ['select', 'eq', 'in', 'order', 'range'])
          b[op] = (...args: unknown[]) => {
            call.filters.push([op, ...args]);
            if (op === 'range') rangeFrom = args[0] as number;
            return b;
          };
        const result = () => {
          const key =
            table === 'workspace_members'
              ? call.filters.some((f) => (f as unknown[])[0] === 'in')
                ? 'memberships'
                : 'context'
              : table === 'workspaces'
                ? 'personal'
                : table === 'task_user_scheduling_settings'
                  ? 'settings'
                  : table === 'task_calendar_events'
                    ? 'linked'
                    : table === 'workspace_calendar_events'
                      ? 'direct'
                      : 'tasks';
          const value = state[key];
          return typeof value === 'function' ? value(rangeFrom) : value;
        };
        b.maybeSingle = () => Promise.resolve(result());
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
        b.then = (
          resolve: (value: unknown) => unknown,
          reject: (error: unknown) => unknown
        ) => Promise.resolve(result()).then(resolve, reject);
        return b;
      }),
    };
  }
  const admin = client(),
    supabase = client();
  const read = (personal = false) =>
    readTaskScheduleBatch({
      admin: admin as never,
      supabase: supabase as never,
      actorId: 'actor',
      wsId: 'context',
      taskIds: ['task-1'],
      personal,
    });
  return { read, calls, admin, supabase, event };
}

describe('authorized task schedule batches', () => {
  it('deduplicates linked/direct event minutes and scopes settings to verified actor', async () => {
    const f = fixture();
    const result = await f.read();
    expect(result.minutesByTaskId['task-1']).toBe(60);
    expect(result.settingsByTaskId['task-1']?.total_duration).toBe(2);
    expect(
      f.calls.find((c) => c.table === 'task_user_scheduling_settings')?.filters
    ).toContainEqual(['eq', 'user_id', 'actor']);
  });
  it('keeps per-user defaults when no settings row exists', async () => {
    const result = await fixture({
      settings: { data: [], error: null },
    }).read();
    expect(result.settingsByTaskId['task-1']).toEqual({
      total_duration: null,
      is_splittable: false,
      min_split_duration_minutes: null,
      max_split_duration_minutes: null,
      calendar_hours: null,
      auto_schedule: false,
    });
  });
  it('rejects missing calendar membership before private task reads', async () => {
    const f = fixture({ context: { data: null, error: null } });
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
    expect(f.admin.from).not.toHaveBeenCalled();
  });
  it('fails closed on calendar membership lookup failure', async () => {
    const f = fixture({ context: { data: null, error: new Error('db') } });
    await expect(f.read()).rejects.toMatchObject({ status: 500 });
    expect(f.admin.from).not.toHaveBeenCalled();
  });
  it('does not treat a guest as a member', async () => {
    const f = fixture({
      memberships: { data: [{ ws_id: 'source', type: 'GUEST' }], error: null },
    });
    expect(await f.read()).toEqual({
      minutesByTaskId: { 'task-1': 0 },
      settingsByTaskId: { 'task-1': null },
    });
    expect(
      f.calls.some((c) => c.table === 'task_user_scheduling_settings')
    ).toBe(false);
  });
  it('rejects spoofed personal mode on a team workspace', async () => {
    const f = fixture({ personal: { data: { personal: false }, error: null } });
    await expect(f.read(true)).rejects.toMatchObject({ status: 400 });
    expect(f.admin.from).not.toHaveBeenCalled();
  });
  it('only includes personal-calendar events in personal mode', async () => {
    const f = fixture();
    expect((await f.read(true)).minutesByTaskId['task-1']).toBe(0);
    expect(
      f.calls.find((c) => c.table === 'workspace_calendar_events')?.filters
    ).toContainEqual(['in', 'ws_id', ['context']]);
  });
  it('does not expose another source calendar through a linked task event', async () => {
    const f = fixture({
      linked: {
        data: [
          {
            task_id: 'task-1',
            workspace_calendar_events: {
              id: 'private',
              ws_id: 'other',
              start_at: '2026-10-05T00:00Z',
              end_at: '2026-10-05T12:00Z',
            },
          },
        ],
        error: null,
      },
      direct: { data: [], error: null },
    });
    expect((await f.read()).minutesByTaskId['task-1']).toBe(0);
  });
  it.each(['tasks', 'memberships', 'settings', 'linked', 'direct'])(
    'does not publish zero after a %s read failure',
    async (key) => {
      await expect(
        fixture({ [key]: { data: null, error: new Error('db') } }).read()
      ).rejects.toMatchObject({ status: 500 });
    }
  );
  it('reads later event pages and propagates later-page failures', async () => {
    const f = fixture({
      linked: (offset: number) =>
        offset === 0
          ? {
              data: Array.from({ length: 500 }, (_, i) => ({
                task_id: 'task-1',
                event_id: `e${i}`,
                workspace_calendar_events: {
                  id: `e${i}`,
                  ws_id: 'source',
                  start_at: '2026-10-05T01:00Z',
                  end_at: '2026-10-05T02:00Z',
                },
              })),
              error: null,
            }
          : { data: null, error: new Error('second page') },
    });
    await expect(f.read()).rejects.toMatchObject({ status: 500 });
    expect(
      f.calls.filter((c) => c.table === 'task_calendar_events')
    ).toHaveLength(2);
  });
});
