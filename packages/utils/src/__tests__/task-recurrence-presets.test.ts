import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  buildCustomTaskRecurrence,
  buildTaskRecurrencePreset,
  detectTaskRecurrencePreset,
  summarizeTaskRecurrence,
  TASK_RECURRENCE_PRESETS,
  toTaskRecurrenceRRule,
} from '../task-recurrence';

const timing = { timeZone: 'Asia/Ho_Chi_Minh' };

describe('task recurrence presets', () => {
  it('derives weekly and monthly presets from the due date', () => {
    const weekly = buildTaskRecurrencePreset('weekly', '2026-11-16', timing);
    expect(weekly.rule).toMatchObject({
      frequency: 'weekly',
      weekdays: ['MO'],
    });
    const monthly = buildTaskRecurrencePreset('monthly', '2026-01-31', timing);
    expect(monthly.rule).toMatchObject({
      frequency: 'monthly',
      monthDay: 31,
      monthDayOverflow: 'last-day',
    });
    expect(summarizeTaskRecurrence(monthly).nextDates).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('moves a weekend start of the weekdays preset to Monday', () => {
    const weekdays = buildTaskRecurrencePreset(
      'weekdays',
      '2026-11-21',
      timing
    );
    expect(weekdays.anchorDate).toBe('2026-11-23');
    expect(weekdays.rule.weekdays).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
  });

  it.each(TASK_RECURRENCE_PRESETS)('round-trips the %s preset', (preset) => {
    expect(
      detectTaskRecurrencePreset(
        buildTaskRecurrencePreset(preset, '2026-11-17', timing)
      )
    ).toBe(preset);
  });

  it('reports custom for anything a preset cannot express', () => {
    const variants = [
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'daily',
        interval: 2,
      }),
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'weekly',
        interval: 1,
        weekdays: ['TU', 'TH'],
      }),
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'daily',
        interval: 1,
        end: { type: 'count', count: 5 },
      }),
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'yearly',
        interval: 1,
      }),
    ];
    for (const variant of variants)
      expect(detectTaskRecurrencePreset(variant)).toBe('custom');
  });
});

describe('buildCustomTaskRecurrence', () => {
  it('orders weekdays from the week start and snaps the anchor', () => {
    const custom = buildCustomTaskRecurrence('2026-11-17', {
      ...timing,
      frequency: 'weekly',
      interval: 2,
      weekdays: ['TH', 'MO'],
      dueTime: '09:00',
      startOffsetDays: 1,
    });
    expect(custom).toMatchObject({
      anchorDate: '2026-11-19',
      dueTime: '09:00',
      startOffsetDays: 1,
      rule: { weekdays: ['MO', 'TH'], interval: 2 },
    });
    expect(summarizeTaskRecurrence(custom)).toMatchObject({
      preset: 'custom',
      frequency: 'weekly',
      interval: 2,
      weekdays: ['MO', 'TH'],
      timeZone: 'Asia/Ho_Chi_Minh',
      nextDates: ['2026-11-19', '2026-11-30', '2026-12-03'],
    });
  });

  it('defaults yearly to the start date month and day', () => {
    const yearly = buildCustomTaskRecurrence('2028-02-29', {
      ...timing,
      frequency: 'yearly',
      interval: 1,
    });
    expect(yearly.rule).toMatchObject({ month: 2, monthDay: 29 });
    expect(
      summarizeTaskRecurrence(yearly, { onOrAfter: '2029-01-01' }).nextDates
    ).toEqual(['2029-02-28', '2030-02-28', '2031-02-28']);
  });

  it.each<[string, Record<string, unknown>, string?]>([
    ['a zero interval', { frequency: 'daily', interval: 0 }],
    ['month 13', { frequency: 'yearly', interval: 1, month: 13 }],
    [
      'an unknown weekday',
      { frequency: 'weekly', interval: 1, weekdays: ['XX'] },
    ],
    ['month day 0', { frequency: 'monthly', interval: 1, monthDay: 0 }],
    [
      'a month day on weekly',
      { frequency: 'weekly', interval: 1, monthDay: 3 },
    ],
    ['a month on monthly', { frequency: 'monthly', interval: 1, month: 3 }],
    [
      'weekdays on daily',
      { frequency: 'daily', interval: 1, weekdays: ['MO'] },
    ],
    [
      'a week start on monthly',
      { frequency: 'monthly', interval: 1, weekStartsOn: 'SU' },
    ],
    [
      'an invalid start date',
      { frequency: 'daily', interval: 1 },
      '2026-02-30',
    ],
    [
      'a start date past 2999',
      { frequency: 'daily', interval: 1 },
      '3000-01-01',
    ],
  ])('rejects %s with a validation error', (_, input, startDate) => {
    expect(() =>
      buildCustomTaskRecurrence(startDate ?? '2026-11-17', {
        ...timing,
        ...(input as unknown as Parameters<
          typeof buildCustomTaskRecurrence
        >[1]),
      })
    ).toThrow(ZodError);
  });

  it('treats an empty weekday selection as unset outside weekly rules', () => {
    const daily = buildCustomTaskRecurrence('2026-11-17', {
      ...timing,
      frequency: 'daily',
      interval: 1,
      weekdays: [],
    });
    expect(daily.rule.weekdays).toBeUndefined();
  });

  it('rejects out-of-range editor input', () => {
    expect(() =>
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'daily',
        interval: 0,
      })
    ).toThrow();
    expect(() =>
      buildCustomTaskRecurrence('2026-11-17', {
        ...timing,
        frequency: 'monthly',
        interval: 1,
        monthDay: 32,
      })
    ).toThrow();
  });
});

describe('toTaskRecurrenceRRule', () => {
  it('exports the RFC 5545 rule with clamped month days and date UNTIL', () => {
    const monthly = buildCustomTaskRecurrence('2026-01-31', {
      ...timing,
      frequency: 'monthly',
      interval: 1,
      end: { type: 'until', date: '2026-12-31' },
    });
    expect(toTaskRecurrenceRRule(monthly)).toEqual({
      dtstart: 'DTSTART;VALUE=DATE:20260131',
      rrule:
        'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20261231',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(
      toTaskRecurrenceRRule(
        buildTaskRecurrencePreset('weekdays', '2026-11-17', timing)
      )
    ).toMatchObject({
      rrule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=MO,TU,WE,TH,FR',
    });
  });
});
