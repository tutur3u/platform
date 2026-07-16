import { describe, expect, it } from 'vitest';
import { computeTaskProgressHabitStreaks } from './_habit-streaks';

describe('computeTaskProgressHabitStreaks', () => {
  it('counts a clean daily streak up to today', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-10',
      now: '2026-07-13',
      threshold: 0,
      entries: [
        { entry_date: '2026-07-10', value: 5 },
        { entry_date: '2026-07-11', value: 3 },
        { entry_date: '2026-07-12', value: 8 },
        { entry_date: '2026-07-13', value: 2 },
      ],
    });
    expect(result.current_streak).toBe(4);
    expect(result.longest_streak).toBe(4);
    expect(result.period_value).toBe(2);
    // closed periods = 10,11,12 (all hit) → 100%
    expect(result.periods_hit).toBe(3);
    expect(result.periods_total).toBe(3);
    expect(result.percent_hit).toBe(100);
  });

  it('does not break the current streak when today is not yet hit', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-10',
      now: '2026-07-13',
      threshold: 0,
      entries: [
        { entry_date: '2026-07-10', value: 5 },
        { entry_date: '2026-07-11', value: 3 },
        { entry_date: '2026-07-12', value: 8 },
        // no entry for 2026-07-13 (current period, in progress)
      ],
    });
    // current period (13th) not yet hit → skipped, streak = 3 closed hits
    expect(result.current_streak).toBe(3);
    expect(result.period_value).toBe(0);
  });

  it('resets the current streak after a missed closed period', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-10',
      now: '2026-07-14',
      threshold: 0,
      entries: [
        { entry_date: '2026-07-10', value: 5 },
        { entry_date: '2026-07-11', value: 3 },
        // 12th missed
        { entry_date: '2026-07-13', value: 8 },
        { entry_date: '2026-07-14', value: 2 },
      ],
    });
    expect(result.longest_streak).toBe(2);
    expect(result.current_streak).toBe(2); // 13th + 14th
    // closed periods = 10,11,12,13 → hit 10,11,13 = 3/4 = 75%
    expect(result.periods_hit).toBe(3);
    expect(result.periods_total).toBe(4);
    expect(result.percent_hit).toBe(75);
  });

  it('applies a per-period threshold', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-10',
      now: '2026-07-12',
      threshold: 500,
      entries: [
        { entry_date: '2026-07-10', value: 600 }, // hit
        { entry_date: '2026-07-11', value: 100 }, // miss
        { entry_date: '2026-07-12', value: 800 }, // hit (current)
      ],
    });
    // closed = 10 (hit), 11 (miss) → 50%
    expect(result.periods_hit).toBe(1);
    expect(result.periods_total).toBe(2);
    expect(result.percent_hit).toBe(50);
    expect(result.current_streak).toBe(1); // current 12th is hit
    expect(result.period_value).toBe(800);
  });

  it('buckets weekly periods by ISO (Monday) week', () => {
    // 2026-07-06 is a Monday; week spans 06–12. 2026-07-13 starts next week.
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_week',
      periodStart: '2026-07-06',
      now: '2026-07-15',
      threshold: 0,
      entries: [
        { entry_date: '2026-07-08', value: 3 },
        { entry_date: '2026-07-10', value: 4 }, // same week as 08
        { entry_date: '2026-07-14', value: 2 }, // next week (current)
      ],
    });
    // week1 total = 7 (hit, closed), week2 total = 2 (hit, current)
    expect(result.periods_total).toBe(1);
    expect(result.periods_hit).toBe(1);
    expect(result.current_streak).toBe(2);
    expect(result.period_value).toBe(2);
  });

  it('computes typical streak as the mean run length', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-01',
      now: '2026-07-08',
      threshold: 0,
      entries: [
        // run of 2 (1,2), gap 3, run of 1 (4), gap 5, run of 3 (6,7,8)
        { entry_date: '2026-07-01', value: 1 },
        { entry_date: '2026-07-02', value: 1 },
        { entry_date: '2026-07-04', value: 1 },
        { entry_date: '2026-07-06', value: 1 },
        { entry_date: '2026-07-07', value: 1 },
        { entry_date: '2026-07-08', value: 1 },
      ],
    });
    // runs = [2, 1, 3] → mean 2.0
    expect(result.typical_streak).toBe(2);
    expect(result.longest_streak).toBe(3);
  });

  it('returns zeros when there are no entries', () => {
    const result = computeTaskProgressHabitStreaks({
      frequency: 'per_day',
      periodStart: '2026-07-10',
      now: '2026-07-12',
      threshold: 0,
      entries: [],
    });
    expect(result).toMatchObject({
      current_streak: 0,
      longest_streak: 0,
      typical_streak: 0,
      periods_hit: 0,
      percent_hit: 0,
      period_value: 0,
    });
  });
});
