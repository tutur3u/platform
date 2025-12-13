import { describe, expect, test } from 'vitest';
import {
  generatePreview,
  type HourSettings,
} from '../lib/calendar/unified-scheduler/preview-engine';
import { zonedDateTimeToUtc } from '../lib/calendar/unified-scheduler/timezone-utils';

describe('Smart Schedule timezone handling', () => {
  test('zonedDateTimeToUtc converts Asia/Bangkok wall time to correct UTC instant', () => {
    const utc = zonedDateTimeToUtc(
      { year: 2025, month: 12, day: 13, hour: 9, minute: 0, second: 0 },
      'Asia/Bangkok'
    );
    expect(utc.toISOString()).toBe('2025-12-13T02:00:00.000Z');
  });

  test('generatePreview schedules habit at correct instant in timezone', () => {
    const hourSettings: HourSettings = {
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
      meetingHours: {
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
    };

    const nowUtc = new Date('2025-12-13T00:00:00.000Z'); // 07:00 in Asia/Bangkok

    const habit = {
      id: 'h1',
      name: 'Deep Work',
      frequency: 'daily',
      recurrence_interval: 1,
      start_date: '2025-12-13',
      end_date: null,
      duration_minutes: 60,
      min_duration_minutes: 60,
      max_duration_minutes: 60,
      ideal_time: '09:00',
      time_preference: null,
      calendar_hours: 'personal_hours',
      priority: 'high',
      color: 'BLUE',
    } as any;

    const result = generatePreview([habit], [], [], hourSettings, {
      windowDays: 1,
      timezone: 'Asia/Bangkok',
      now: nowUtc,
    });

    expect(result.events.length).toBeGreaterThan(0);
    const firstHabitEvent = result.events.find((e) => e.type === 'habit');
    expect(firstHabitEvent).toBeTruthy();

    // 09:00 in Asia/Bangkok is 02:00Z
    expect(firstHabitEvent!.start_at).toBe('2025-12-13T02:00:00.000Z');
  });
});
