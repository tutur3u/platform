import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { describe, expect, it } from 'vitest';
import { calculateMeetPlanInsights, rankMeetTimeframes } from './meet-insights';

const plan: MeetTogetherPlan = {
  dates: ['2026-08-04'],
  duration_minutes: 30,
  start_time: '09:00:00+07',
  end_time: '10:00:00+07',
};

const users = [
  { id: 'user-a', display_name: 'An', is_guest: false, timeblock_count: 1 },
  { id: 'user-b', display_name: 'Binh', is_guest: true, timeblock_count: 1 },
];

describe('Tuturuuu Meet ranking and insights', () => {
  it('ranks duration-aware confirmed overlap before tentative overlap', () => {
    const ranked = rankMeetTimeframes({
      plan,
      users,
      timeblocks: [
        {
          date: '2026-08-04',
          start_time: '09:00:00+07',
          end_time: '10:00:00+07',
          user_id: 'user-a',
          tentative: false,
        },
        {
          date: '2026-08-04',
          start_time: '09:00:00+07',
          end_time: '09:30:00+07',
          user_id: 'user-b',
          tentative: false,
        },
        {
          date: '2026-08-04',
          start_time: '09:30:00+07',
          end_time: '10:00:00+07',
          user_id: 'user-b',
          tentative: true,
        },
      ],
    });

    expect(ranked[0]).toMatchObject({
      startMinute: 540,
      endMinute: 570,
      confirmedUserIds: ['user-a', 'user-b'],
      confirmedPercent: 100,
    });
    expect(ranked.at(-1)?.weightedPercent).toBe(75);
  });

  it('computes response, peak, and average availability from plan data', () => {
    const insights = calculateMeetPlanInsights({
      plan,
      users,
      timeblocks: [
        {
          date: '2026-08-04',
          start_time: '09:00:00+07',
          end_time: '10:00:00+07',
          user_id: 'user-a',
          tentative: false,
        },
      ],
    });

    expect(insights.respondedCount).toBe(1);
    expect(insights.responsePercent).toBe(50);
    expect(insights.peakAttendance).toBe(1);
    expect(insights.peakAttendancePercent).toBe(50);
  });
});
