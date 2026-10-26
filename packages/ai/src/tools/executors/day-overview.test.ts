import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  DAY_OVERVIEW_LIMITS,
  executeGetDayOverview,
  summarizeDayProgress,
} from './day-overview';
import { ENTRY_PAGE_LIMIT } from './habit-helpers';
import { supabaseStub, trackerFixture } from './habit-test-utils';

const mocks = vi.hoisted(() => ({
  getMyTasks: vi.fn(),
  listTrackers: vi.fn(),
  listEntries: vi.fn(),
}));
vi.mock('./tasks', () => ({ executeGetMyTasks: mocks.getMyTasks }));
vi.mock('./helpers/encryption', () => ({
  decryptEventsForTools: async (events: unknown[]) => events,
}));
vi.mock('@tuturuuu/internal-api/habit-trackers', () => ({
  listWorkspaceHabitTrackers: mocks.listTrackers,
  listWorkspaceHabitTrackerEntries: mocks.listEntries,
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  withForwardedInternalApiAuth: (_headers: unknown, options: unknown) =>
    options,
}));

const task = (id: string, dueDate: string | null) => ({
  id,
  name: `Task ${id}`,
  priority: 'normal',
  dueDate,
});
const event = (id: string, start: string, end: string) => ({
  id,
  title: `Event ${id}`,
  start_at: start,
  end_at: end,
  location: null,
  is_encrypted: false,
  locked: false,
});

function context(overrides: Partial<MiraToolContext> = {}) {
  return {
    userId: 'user-1',
    wsId: 'ws-1',
    timezone: 'Asia/Ho_Chi_Minh',
    requestHeaders: new Headers(),
    authorizeWorkspaceTools: vi.fn(async () => true),
    supabase: supabaseStub({
      workspace_calendar_events: {
        data: [event('e1', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z')],
        error: null,
      },
      time_tracking_sessions: {
        data: {
          id: 's1',
          title: 'Deep work',
          start_time: '2026-10-25T02:00:00Z',
        },
        error: null,
      },
    }),
    ...overrides,
  } as unknown as MiraToolContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 2026-10-25 09:30 in Ho Chi Minh City.
  vi.setSystemTime(new Date('2026-10-25T02:30:00Z'));
  mocks.getMyTasks.mockResolvedValue({
    overdue: {
      count: 1,
      tasks: [task('late', '2026-10-23T10:00:00Z')],
    },
    today: {
      count: 2,
      // 16:59Z is still 25 Oct locally; 17:00Z is already 26 Oct.
      tasks: [
        task('due', '2026-10-25T16:59:00Z'),
        task('tomorrow', '2026-10-25T17:00:00Z'),
      ],
    },
    upcoming: {
      count: 2,
      tasks: [task('early', '2026-10-24T17:30:00Z'), task('undated', null)],
    },
  });
  const water = trackerFixture({
    id: 'water',
    name: 'Water',
    aggregation_strategy: 'sum',
    target_value: 4,
    primary_metric_key: 'glasses',
  });
  mocks.listTrackers.mockResolvedValue({ trackers: [{ tracker: water }] });
  mocks.listEntries.mockResolvedValue([
    {
      user_id: 'user-1',
      entry_date: '2026-10-25',
      primary_value: 2,
      values: {},
    },
    {
      user_id: 'user-1',
      entry_date: '2026-10-25',
      primary_value: 3,
      values: {},
    },
    {
      user_id: 'user-1',
      entry_date: '2026-10-24',
      primary_value: 9,
      values: {},
    },
    {
      user_id: 'user-2',
      entry_date: '2026-10-25',
      primary_value: 9,
      values: {},
    },
  ]);
});
afterEach(() => vi.useRealTimers());

describe('get_day_overview', () => {
  it('builds every section against the user timezone day', async () => {
    const result = (await executeGetDayOverview({}, context())) as Record<
      string,
      any
    >;
    expect(result).toMatchObject({
      success: true,
      date: '2026-10-25',
      timezone: 'Asia/Ho_Chi_Minh',
      window: {
        start: '2026-10-24T17:00:00.000Z',
        end: '2026-10-25T17:00:00.000Z',
      },
    });
    expect(result.timezoneAssumed).toBeUndefined();
    expect(result.errors).toBeUndefined();
    expect(result.tasks.dueOnDay.map((t: { id: string }) => t.id)).toEqual([
      'early',
      'due',
    ]);
    expect(result.tasks.dueOnDay[1].dueDate).toBe('2026-10-25T23:59:00+07:00');
    expect(result.tasks.overdue.map((t: { id: string }) => t.id)).toEqual([
      'late',
    ]);
    expect(result.calendar.events[0]).toMatchObject({
      id: 'e1',
      start: '2026-10-25T08:00:00+07:00',
    });
    expect(result.habits.trackers[0]).toMatchObject({
      id: 'water',
      dayTotal: 5,
      entryCount: 2,
      met: true,
    });
    expect(result.timer.running).toMatchObject({
      id: 's1',
      elapsedMinutes: 30,
    });
  });

  it('returns partial results with per-section errors', async () => {
    mocks.getMyTasks.mockResolvedValue({ success: false, error: 'Tasks down' });
    mocks.listTrackers.mockRejectedValue(new Error('Habits down'));
    const result = (await executeGetDayOverview(
      {},
      context({ authorizeWorkspaceTools: vi.fn(async () => false) })
    )) as Record<string, any>;
    expect(result).toMatchObject({
      success: true,
      partial: true,
      tasks: null,
      calendar: null,
      habits: null,
      errors: {
        tasks: 'Tasks down',
        calendar: expect.stringMatching(/calendar access/),
        habits: 'Habits down',
      },
    });
    expect(result.timer.running).toMatchObject({ id: 's1' });
  });

  it('fails closed on calendar access when permissions cannot be checked', async () => {
    const result = (await executeGetDayOverview(
      {},
      context({ authorizeWorkspaceTools: undefined })
    )) as Record<string, any>;
    expect(result.calendar).toBeNull();
    expect(result.errors.calendar).toMatch(/could not be verified/);
    expect(result.tasks).not.toBeNull();
  });

  it('reports total failure without inventing data', async () => {
    mocks.getMyTasks.mockRejectedValue(new Error('down'));
    mocks.listTrackers.mockRejectedValue(new Error('down'));
    const result = (await executeGetDayOverview(
      {},
      context({
        authorizeWorkspaceTools: vi.fn(async () => false),
        supabase: supabaseStub({
          time_tracking_sessions: { data: null, error: { message: 'down' } },
        }),
      } as Partial<MiraToolContext>)
    )) as Record<string, any>;
    expect(result.success).toBe(false);
    expect(Object.keys(result.errors)).toEqual([
      'tasks',
      'calendar',
      'habits',
      'timer',
    ]);
  });

  it('uses an explicit date and flags an assumed UTC timezone', async () => {
    const result = (await executeGetDayOverview(
      { date: '2026-10-23' },
      context({ timezone: undefined })
    )) as Record<string, any>;
    expect(result).toMatchObject({
      date: '2026-10-23',
      timezone: 'UTC',
      timezoneAssumed: true,
      window: { start: '2026-10-23T00:00:00.000Z' },
    });
    expect(result.tasks.dueOnDay.map((t: { id: string }) => t.id)).toEqual([
      'late',
    ]);
  });

  it('rejects impossible dates and caps task output', async () => {
    expect(
      await executeGetDayOverview({ date: '2026-02-30' }, context())
    ).toMatchObject({ success: false });
    mocks.getMyTasks.mockResolvedValue({
      today: {
        count: 20,
        tasks: Array.from({ length: 20 }, (_, index) =>
          task(`t${index}`, '2026-10-25T05:00:00Z')
        ),
      },
    });
    const result = (await executeGetDayOverview({}, context())) as Record<
      string,
      any
    >;
    expect(result.tasks.dueOnDay).toHaveLength(DAY_OVERVIEW_LIMITS.tasks);
    expect(result.tasks.counts.dueOnDay).toBe(20);
    expect(result.tasks.truncated).toBe(true);
  });

  it('reports capped habit history as incomplete, not zero', async () => {
    // The list is full of newer entries; today's entry is beyond the cap.
    const others = Array.from({ length: ENTRY_PAGE_LIMIT }, () => ({
      user_id: 'user-2',
      entry_date: '2026-10-25',
      primary_value: 1,
      values: {},
    }));
    mocks.listEntries.mockResolvedValue(others);
    const result = (await executeGetDayOverview({}, context())) as Record<
      string,
      any
    >;
    expect(result.habits.trackers[0]).toMatchObject({
      id: 'water',
      progress: 'incomplete',
      dayTotal: null,
      visibleTotal: 0,
      visibleEntryCount: 0,
      met: null,
    });
    expect(result.habits.trackers[0]).not.toHaveProperty('entryCount');
  });
});

describe('summarizeDayProgress', () => {
  const entry = (user: string, value: number) => ({
    user_id: user,
    entry_date: '2026-10-25',
    primary_value: value,
    values: {},
  });

  it('is exact below the cap', () => {
    const tracker = trackerFixture({ aggregation_strategy: 'sum' });
    expect(
      summarizeDayProgress(
        tracker,
        Array.from({ length: ENTRY_PAGE_LIMIT - 1 }, () => entry('user-1', 1)),
        'user-1',
        '2026-10-25'
      )
    ).toMatchObject({ progress: 'complete', dayTotal: 49, met: false });
  });

  it('only confirms a met target that hidden entries cannot undo', () => {
    const full = Array.from({ length: ENTRY_PAGE_LIMIT }, () =>
      entry('user-1', 80)
    );
    expect(
      summarizeDayProgress(
        trackerFixture({ aggregation_strategy: 'max', target_value: 70 }),
        full,
        'user-1',
        '2026-10-25'
      )
    ).toMatchObject({ progress: 'incomplete', visibleTotal: 80, met: true });
    expect(
      summarizeDayProgress(
        trackerFixture({ aggregation_strategy: 'sum', target_value: 70 }),
        full,
        'user-1',
        '2026-10-25'
      )
    ).toMatchObject({ progress: 'incomplete', met: null });
  });
});
