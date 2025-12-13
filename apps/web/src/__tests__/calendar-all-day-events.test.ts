import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { describe, expect, test } from 'vitest';
import {
  generatePreview,
  type HourSettings,
} from '../lib/calendar/unified-scheduler/preview-engine';

// Standard hour settings for tests
const standardHourSettings: HourSettings = {
  personalHours: {
    sunday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    monday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    tuesday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    wednesday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    thursday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    friday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
    saturday: {
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    },
  },
  workHours: {
    sunday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    monday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    tuesday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    wednesday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    thursday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    friday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
    saturday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
  },
  meetingHours: {
    sunday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    monday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    tuesday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    wednesday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    thursday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    friday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
    saturday: {
      enabled: true,
      timeBlocks: [{ startTime: '10:00', endTime: '16:00' }],
    },
  },
};

describe('All-day event detection', () => {
  test('identifies 24-hour midnight-to-midnight event as all-day', () => {
    const event = {
      start_at: '2025-12-18T00:00:00.000Z',
      end_at: '2025-12-19T00:00:00.000Z',
    };
    expect(isAllDayEvent(event)).toBe(true);
  });

  test('identifies multi-day midnight-to-midnight event as all-day', () => {
    const event = {
      start_at: '2025-12-18T00:00:00.000Z',
      end_at: '2025-12-21T00:00:00.000Z', // 3 days
    };
    expect(isAllDayEvent(event)).toBe(true);
  });

  test('does NOT identify event starting at non-midnight as all-day', () => {
    const event = {
      start_at: '2025-12-18T08:00:00.000Z',
      end_at: '2025-12-19T00:00:00.000Z',
    };
    expect(isAllDayEvent(event)).toBe(false);
  });

  test('does NOT identify event ending at non-midnight as all-day', () => {
    const event = {
      start_at: '2025-12-18T00:00:00.000Z',
      end_at: '2025-12-18T17:00:00.000Z',
    };
    expect(isAllDayEvent(event)).toBe(false);
  });

  test('does NOT identify partial day event as all-day', () => {
    const event = {
      start_at: '2025-12-18T09:00:00.000Z',
      end_at: '2025-12-18T17:00:00.000Z',
    };
    expect(isAllDayEvent(event)).toBe(false);
  });

  test('does NOT identify event with non-24h-multiple duration as all-day', () => {
    // 36 hours - not a multiple of 24
    const event = {
      start_at: '2025-12-18T00:00:00.000Z',
      end_at: '2025-12-19T12:00:00.000Z',
    };
    expect(isAllDayEvent(event)).toBe(false);
  });
});

describe('Smart Schedule with all-day events', () => {
  test('habits can be scheduled on days with all-day events when filtered', () => {
    const nowUtc = new Date('2025-12-18T00:00:00.000Z'); // Start of the all-day event

    const habit = {
      id: 'h1',
      name: 'Dinner',
      frequency: 'daily',
      recurrence_interval: 1,
      start_date: '2025-12-18',
      end_date: null,
      duration_minutes: 30,
      min_duration_minutes: 30,
      max_duration_minutes: 30,
      ideal_time: '18:30',
      time_preference: null,
      calendar_hours: 'personal_hours',
      priority: 'normal',
      color: 'GREEN',
    } as any;

    // All-day event that should be filtered out
    const allDayEvent = {
      id: 'all-day-1',
      title: '[NCT] Secret Santa',
      start_at: '2025-12-18T00:00:00.000Z',
      end_at: '2025-12-19T00:00:00.000Z',
      locked: true,
    } as any;

    // Filter out all-day events before passing to generatePreview
    const events = [allDayEvent];
    const filteredEvents = events.filter((e) => !isAllDayEvent(e));

    const result = generatePreview(
      [habit],
      [],
      filteredEvents,
      standardHourSettings,
      {
        windowDays: 1,
        timezone: 'UTC',
        now: nowUtc,
      }
    );

    // Habit should be scheduled since the all-day event was filtered
    expect(result.events.length).toBeGreaterThan(0);
    const habitEvent = result.events.find((e) => e.type === 'habit');
    expect(habitEvent).toBeTruthy();
    expect(habitEvent!.title).toBe('Dinner');
  });

  test('regular timed events still block scheduling', () => {
    const nowUtc = new Date('2025-12-18T00:00:00.000Z');

    const habit = {
      id: 'h1',
      name: 'Meeting',
      frequency: 'daily',
      recurrence_interval: 1,
      start_date: '2025-12-18',
      end_date: null,
      duration_minutes: 60,
      min_duration_minutes: 60,
      max_duration_minutes: 60,
      ideal_time: '10:00',
      time_preference: null,
      calendar_hours: 'personal_hours',
      priority: 'normal',
      color: 'BLUE',
    } as any;

    // Regular timed event that blocks 10:00-11:00
    const timedEvent = {
      id: 'timed-1',
      title: 'Existing Meeting',
      start_at: '2025-12-18T10:00:00.000Z',
      end_at: '2025-12-18T11:00:00.000Z',
      locked: true,
    } as any;

    // NOT an all-day event, should NOT be filtered
    expect(isAllDayEvent(timedEvent)).toBe(false);

    const result = generatePreview(
      [habit],
      [],
      [timedEvent],
      standardHourSettings,
      {
        windowDays: 1,
        timezone: 'UTC',
        now: nowUtc,
      }
    );

    // Habit should still be scheduled but NOT at 10:00 (that slot is blocked)
    const habitEvent = result.events.find((e) => e.type === 'habit');
    if (habitEvent) {
      // If scheduled, it should NOT overlap with the blocked time
      const habitStart = new Date(habitEvent.start_at).getTime();
      const habitEnd = new Date(habitEvent.end_at).getTime();
      const blockedStart = new Date(timedEvent.start_at).getTime();
      const blockedEnd = new Date(timedEvent.end_at).getTime();

      const hasOverlap = habitStart < blockedEnd && habitEnd > blockedStart;
      expect(hasOverlap).toBe(false);
    }
  });
});
