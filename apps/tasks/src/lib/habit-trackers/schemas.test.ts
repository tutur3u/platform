import { describe, expect, it } from 'vitest';
import {
  habitTrackerEntryInputSchema,
  habitTrackerInputSchema,
} from './schemas';

describe('habit tracker schemas', () => {
  it('parses tracker metadata for specialized templates', () => {
    const parsed = habitTrackerInputSchema.parse({
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
        {
          key: 'session_count',
          label: 'Session',
          type: 'number',
        },
      ],
      use_case: 'workout_session',
      template_category: 'strength',
      composer_mode: 'workout_session',
      composer_config: {
        suggested_exercises: ['Bench Press', 'Squat'],
        default_sets: 4,
        default_reps: 8,
        default_weight_unit: 'kg',
      },
    });

    expect(parsed.use_case).toBe('workout_session');
    expect(parsed.composer_mode).toBe('workout_session');
    expect(parsed.composer_config.suggested_exercises).toEqual([
      'Bench Press',
      'Squat',
    ]);
  });

  it('accepts workout session entry blocks inside values', () => {
    const parsed = habitTrackerEntryInputSchema.parse({
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
        ],
      },
    });

    expect(parsed.values.exercise_blocks).toHaveLength(1);
  });

  it('keeps scalar-only entries backward compatible', () => {
    const parsed = habitTrackerEntryInputSchema.parse({
      entry_date: '2026-04-10',
      values: {
        glasses: 2,
        note: 'Morning',
      },
    });

    expect(parsed.values.glasses).toBe(2);
    expect(parsed.values.note).toBe('Morning');
  });
});
