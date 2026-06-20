import { describe, expect, it } from 'vitest';
import { summarizeNextFourWeekSchedule } from './session-schedule-summary';

describe('summarizeNextFourWeekSchedule', () => {
  it('detects compact weekday time patterns in the selected timezone', () => {
    const dates = [
      '2026-06-16',
      '2026-06-18',
      '2026-06-23',
      '2026-06-25',
      '2026-06-30',
      '2026-07-02',
      '2026-07-07',
      '2026-07-09',
    ];

    const summary = summarizeNextFourWeekSchedule({
      from: '2026-06-16T00:00:00.000Z',
      occurrences: dates.map((date) => ({
        endsAt: `${date}T01:00:00.000Z`,
        groupId: 'group-1',
        startsAt: `${date}T00:00:00.000Z`,
      })),
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(summary.upcomingCount).toBe(8);
    expect(summary.exceptionCount).toBe(0);
    expect(summary.patterns).toEqual([
      {
        daysOfWeek: [2, 4],
        endTime: '08:00',
        exceptionCount: 0,
        expectedCount: 8,
        occurrenceCount: 8,
        startTime: '07:00',
      },
    ]);
  });

  it('classifies sparse one-off sessions as upcoming exceptions', () => {
    const summary = summarizeNextFourWeekSchedule({
      from: '2026-06-16T00:00:00.000Z',
      occurrences: [
        {
          endsAt: '2026-06-16T01:00:00.000Z',
          groupId: 'group-1',
          startsAt: '2026-06-16T00:00:00.000Z',
        },
      ],
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(summary.upcomingCount).toBe(1);
    expect(summary.patterns).toEqual([]);
    expect(summary.exceptionCount).toBe(1);
  });
});
