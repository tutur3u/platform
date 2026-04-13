import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  createHabitTrackerEntry,
  getHabitTrackerDetail,
  listHabitTrackerCards,
} from './service';

function createSelectBuilder({
  resolved,
  maybeSingleData,
}: {
  resolved: unknown;
  maybeSingleData?: unknown;
}) {
  const builder: Record<string, unknown> = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn().mockResolvedValue({ data: resolved, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: maybeSingleData ?? null,
      error: null,
    }),
  };

  return builder;
}

function createSupabaseMock({
  trackers,
  trackerDetail,
  entries,
  actions,
  latestStats = [],
  workspaceLinks = [],
  workspaceUsers = [],
}: {
  trackers: unknown[];
  trackerDetail?: unknown;
  entries: unknown[];
  actions: unknown[];
  latestStats?: unknown[];
  workspaceLinks?: unknown[];
  workspaceUsers?: unknown[];
}) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: latestStats,
      error: null,
    }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'workspace_user_linked_users') {
        return {
          select: vi.fn().mockReturnValue(
            createSelectBuilder({
              resolved: workspaceLinks,
            })
          ),
        };
      }
      if (table === 'workspace_users') {
        return {
          select: vi.fn().mockReturnValue(
            createSelectBuilder({
              resolved: workspaceUsers,
            })
          ),
        };
      }
      if (table === 'workspace_habit_trackers') {
        return {
          select: vi.fn().mockReturnValue(
            createSelectBuilder({
              resolved: trackers,
              maybeSingleData: trackerDetail,
            })
          ),
        };
      }
      if (table === 'workspace_habit_tracker_entries') {
        return {
          select: vi.fn().mockReturnValue(
            createSelectBuilder({
              resolved: entries,
            })
          ),
        };
      }
      if (table === 'workspace_habit_tracker_streak_actions') {
        return {
          select: vi.fn().mockReturnValue(
            createSelectBuilder({
              resolved: actions,
            })
          ),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as TypedSupabaseClient;
}

const today = new Date().toISOString().slice(0, 10);
const todayAtNoon = `${today}T12:00:00.000Z`;

const baseTrackerRow = {
  id: 'tracker-1',
  ws_id: 'ws-1',
  name: 'Body Weight',
  color: 'BLUE',
  icon: 'Scale',
  tracking_mode: 'daily_summary',
  target_period: 'daily',
  target_operator: 'gte',
  target_value: 70,
  primary_metric_key: 'weight',
  aggregation_strategy: 'max',
  input_schema: [
    { key: 'weight', label: 'Weight', type: 'number', unit: 'kg' },
  ],
  quick_add_values: [],
  freeze_allowance: 0,
  recovery_window_periods: 0,
  start_date: today,
  use_case: 'body_weight',
  template_category: 'health',
  composer_mode: 'measurement',
  composer_config: { unit: 'kg' },
  is_active: true,
  archived_at: null,
  created_at: todayAtNoon,
  updated_at: todayAtNoon,
};

const baseEntryRow = {
  id: 'entry-1',
  ws_id: 'ws-1',
  tracker_id: 'tracker-1',
  user_id: 'viewer-1',
  entry_kind: 'daily_summary',
  entry_date: today,
  occurred_at: todayAtNoon,
  values: { weight: 44 },
  primary_value: 44,
  tags: [],
  created_at: todayAtNoon,
  updated_at: todayAtNoon,
};

const baseLatestStatRow = {
  tracker_id: 'tracker-1',
  user_id: 'viewer-1',
  latest_entry_id: 'entry-1',
  latest_entry_date: today,
  latest_occurred_at: todayAtNoon,
  latest_primary_value: 44,
  latest_values: { weight: 44 },
  current_period_total: 44,
  total_entries: 1,
  total_value: 44,
};

describe('habit tracker service', () => {
  it('returns self-scope card summaries even when the viewer is not in members', async () => {
    const supabase = createSupabaseMock({
      trackers: [baseTrackerRow],
      trackerDetail: baseTrackerRow,
      entries: [baseEntryRow],
      actions: [],
      latestStats: [baseLatestStatRow],
    });

    const response = await listHabitTrackerCards(
      supabase,
      'ws-1',
      'viewer-1',
      'self'
    );

    expect(response.trackers[0]?.current_member?.member.display_name).toBe(
      'You'
    );
    expect(response.trackers[0]?.current_member?.current_period_total).toBe(44);
    expect(response.trackers[0]?.current_member?.latest_value).toBe(44);
  });

  it('returns self-scope detail metrics even when the viewer is not in members', async () => {
    const supabase = createSupabaseMock({
      trackers: [baseTrackerRow],
      trackerDetail: baseTrackerRow,
      entries: [baseEntryRow],
      actions: [],
      latestStats: [baseLatestStatRow],
    });

    const response = await getHabitTrackerDetail(
      supabase,
      'ws-1',
      'tracker-1',
      'viewer-1',
      'self'
    );

    expect(response.current_member?.current_period_total).toBe(44);
    expect(response.current_member?.latest_value).toBe(44);
    expect(response.current_period_metrics.at(-1)?.total).toBe(44);
  });

  it('derives workout session totals and primary value on create', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'tracker-1',
        ws_id: 'ws-1',
        name: 'Workout Session',
        color: 'RED',
        icon: 'Dumbbell',
        tracking_mode: 'event_log',
        target_period: 'weekly',
        target_operator: 'gte',
        target_value: 3,
        primary_metric_key: 'session_count',
        aggregation_strategy: 'count_entries',
        input_schema: [
          { key: 'session_count', label: 'Session', type: 'number' },
        ],
        quick_add_values: [],
        freeze_allowance: 1,
        recovery_window_periods: 1,
        start_date: '2026-04-10',
        use_case: 'workout_session',
        template_category: 'strength',
        composer_mode: 'workout_session',
        composer_config: {},
        is_active: true,
        archived_at: null,
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      },
      error: null,
    });
    const is = vi.fn().mockReturnValue({ maybeSingle });
    const eqTrackerId = vi.fn().mockReturnValue({ is });
    const eqWsId = vi.fn().mockReturnValue({ eq: eqTrackerId });
    const selectTracker = vi.fn().mockReturnValue({ eq: eqWsId });

    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'entry-1',
        ws_id: 'ws-1',
        tracker_id: 'tracker-1',
        user_id: 'user-1',
        entry_kind: 'event_log',
        entry_date: '2026-04-10',
        occurred_at: '2026-04-10T00:00:00.000Z',
        values: {
          session_count: 1,
          total_sets: 8,
          total_reps: 56,
          total_volume: 2400,
        },
        primary_value: 1,
        tags: [],
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      },
      error: null,
    });
    const selectInserted = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectInserted });

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'workspace_habit_trackers') {
          return { select: selectTracker };
        }
        if (table === 'workspace_habit_tracker_entries') {
          return { insert };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as TypedSupabaseClient;

    await createHabitTrackerEntry(supabase, 'ws-1', 'tracker-1', 'user-1', {
      entry_date: '2026-04-10',
      values: {
        exercise_blocks: [
          {
            exercise_name: 'Bench Press',
            sets: 4,
            reps: 8,
            weight: 60,
            unit: 'kg',
          },
          {
            exercise_name: 'Row',
            sets: 4,
            reps: 6,
            weight: 20,
            unit: 'kg',
          },
        ],
      },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        primary_value: 1,
        values: expect.objectContaining({
          session_count: 1,
          total_sets: 8,
          total_reps: 56,
          total_volume: 2400,
          exercise_blocks: expect.any(Array),
        }),
      })
    );
  });
});
