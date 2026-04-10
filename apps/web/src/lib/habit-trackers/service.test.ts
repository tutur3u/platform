import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { createHabitTrackerEntry } from './service';

describe('habit tracker service', () => {
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
