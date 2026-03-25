import type {
  HabitTracker,
  HabitTrackerEntry,
  HabitTrackerMember,
  HabitTrackerStreakAction,
} from '@tuturuuu/types/primitives/HabitTracker';
import { describe, expect, it } from 'vitest';
import {
  buildHabitTrackerLeaderboard,
  buildHabitTrackerMemberSummary,
  computeHabitTrackerStreakSummary,
} from './streaks';

function createTracker(overrides: Partial<HabitTracker> = {}): HabitTracker {
  return {
    id: 'tracker-1',
    ws_id: 'ws-1',
    name: 'Hydration',
    description: null,
    color: 'BLUE',
    icon: 'Droplets',
    tracking_mode: 'event_log',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 1,
    primary_metric_key: 'value',
    aggregation_strategy: 'sum',
    input_schema: [
      {
        key: 'value',
        label: 'Value',
        type: 'number',
        required: true,
      },
    ],
    quick_add_values: [1, 2],
    freeze_allowance: 2,
    recovery_window_periods: 2,
    start_date: '2026-03-20',
    created_by: 'user-1',
    is_active: true,
    archived_at: null,
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

function createEntry(
  entryDate: string,
  userId = 'user-1',
  value = 1
): HabitTrackerEntry {
  return {
    id: `${userId}-${entryDate}`,
    ws_id: 'ws-1',
    tracker_id: 'tracker-1',
    user_id: userId,
    entry_kind: 'event_log',
    entry_date: entryDate,
    occurred_at: `${entryDate}T09:00:00.000Z`,
    values: { value },
    primary_value: value,
    note: null,
    tags: [],
    created_by: userId,
    created_at: `${entryDate}T09:00:00.000Z`,
    updated_at: `${entryDate}T09:00:00.000Z`,
  };
}

function createAction(
  periodStart: string,
  actionType: HabitTrackerStreakAction['action_type']
): HabitTrackerStreakAction {
  return {
    id: `${actionType}-${periodStart}`,
    ws_id: 'ws-1',
    tracker_id: 'tracker-1',
    user_id: 'user-1',
    action_type: actionType,
    period_start: periodStart,
    period_end: periodStart,
    note: null,
    created_by: 'user-1',
    created_at: `${periodStart}T12:00:00.000Z`,
    updated_at: `${periodStart}T12:00:00.000Z`,
  };
}

describe('habit tracker streaks', () => {
  it('keeps streak continuity when a missed day is repaired', () => {
    const tracker = createTracker({ start_date: '2026-03-20' });
    const entries = [
      createEntry('2026-03-20'),
      createEntry('2026-03-21'),
      createEntry('2026-03-23'),
      createEntry('2026-03-24'),
    ];
    const actions = [createAction('2026-03-22', 'repair')];

    const summary = computeHabitTrackerStreakSummary(tracker, entries, actions);

    expect(summary.streak.best_streak).toBeGreaterThanOrEqual(4);
    expect(summary.streak.freezes_used).toBe(0);
  });

  it('exposes a recovery window and freeze usage', () => {
    const tracker = createTracker({ start_date: '2026-03-21' });
    const entries = [createEntry('2026-03-21'), createEntry('2026-03-24')];
    const actions = [createAction('2026-03-22', 'freeze')];

    const summary = computeHabitTrackerStreakSummary(tracker, entries, actions);

    expect(summary.streak.freezes_used).toBe(1);
    expect(summary.streak.recovery_window.eligible).toBe(true);
    expect(summary.streak.recovery_window.period_start).toBe('2026-03-23');
  });

  it('sorts leaderboard by current streak then best streak then consistency', () => {
    const tracker = createTracker();
    const alice: HabitTrackerMember = {
      user_id: 'user-1',
      display_name: 'Alice',
      avatar_url: null,
      email: 'alice@example.com',
      workspace_user_id: 'wu-1',
    };
    const bob: HabitTrackerMember = {
      user_id: 'user-2',
      display_name: 'Bob',
      avatar_url: null,
      email: 'bob@example.com',
      workspace_user_id: 'wu-2',
    };

    const aliceSummary = buildHabitTrackerMemberSummary(
      tracker,
      alice,
      [
        createEntry('2026-03-20'),
        createEntry('2026-03-21'),
        createEntry('2026-03-22'),
      ],
      []
    );
    const bobSummary = buildHabitTrackerMemberSummary(
      tracker,
      bob,
      [createEntry('2026-03-20', 'user-2')],
      []
    );

    const leaderboard = buildHabitTrackerLeaderboard([
      bobSummary,
      aliceSummary,
    ]);

    expect(leaderboard[0]?.member.display_name).toBe('Alice');
    expect(leaderboard[1]?.member.display_name).toBe('Bob');
  });
});
