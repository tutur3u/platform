import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import { describe, expect, it } from 'vitest';
import { expandCalendarRecurrence } from '../calendar-recurrence';
import {
  isTaskOccurrenceDate,
  listTaskOccurrenceDates,
  nextTaskOccurrenceDate,
  snapTaskRecurrenceAnchor,
  type TaskRecurrenceSchedule,
  taskRecurrenceAllDayAnchor,
  validateTaskRecurrence,
} from '../task-recurrence';

const rule = (
  overrides: Partial<CalendarRecurrenceRule> = {}
): CalendarRecurrenceRule => ({
  version: 1,
  frequency: 'daily',
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'never' },
  ...overrides,
});
const schedule = (
  anchorDate: string,
  overrides: Partial<CalendarRecurrenceRule> = {}
): TaskRecurrenceSchedule => ({
  rule: rule(overrides),
  anchorDate,
  dueTime: null,
  startOffsetDays: 0,
});
const list = (s: TaskRecurrenceSchedule, limit = 6, onOrAfter?: string) =>
  listTaskOccurrenceDates(s, { limit, onOrAfter });
const monthly31 = {
  frequency: 'monthly',
  monthDay: 31,
  monthDayOverflow: 'last-day',
} as const;

describe('task recurrence validation', () => {
  it.each([
    ['interval above 99', { interval: 100 }],
    [
      'relative weekday',
      { frequency: 'monthly', weekdays: ['MO'], weekIndex: 1 },
    ],
    ['month day without clamping', { frequency: 'monthly', monthDay: 31 }],
    ['month day that skips', { ...monthly31, monthDayOverflow: 'skip' }],
    ['count above 1,000', { end: { type: 'count', count: 1001 } }],
    ['sub-daily or unknown frequency', { frequency: 'hourly' }],
    ['offset time zone', { timeZone: '+07:00' }],
    ['unknown time zone', { timeZone: 'Mars/Olympus' }],
  ] as const)('rejects %s', (_, overrides) => {
    expect(() =>
      validateTaskRecurrence(
        schedule('2026-01-31', overrides as Partial<CalendarRecurrenceRule>)
      )
    ).toThrow();
  });

  it('rejects an anchor that does not match its pattern', () => {
    expect(() =>
      validateTaskRecurrence(
        schedule('2026-11-17', { frequency: 'weekly', weekdays: ['MO'] })
      )
    ).toThrow(/anchor/);
  });

  it('bounds UNTIL to five years after the anchor and not before it', () => {
    expect(() =>
      validateTaskRecurrence(
        schedule('2026-01-01', { end: { type: 'until', date: '2031-01-02' } })
      )
    ).toThrow(/5 years/);
    expect(() =>
      validateTaskRecurrence(
        schedule('2026-01-01', { end: { type: 'until', date: '2025-12-31' } })
      )
    ).toThrow();
    expect(
      validateTaskRecurrence(
        schedule('2026-01-01', { end: { type: 'until', date: '2031-01-01' } })
      ).rule.end
    ).toEqual({ type: 'until', date: '2031-01-01' });
  });

  it('validates due time and start offset bounds', () => {
    const base = schedule('2026-01-01');
    expect(() =>
      validateTaskRecurrence({ ...base, dueTime: '24:00' })
    ).toThrow();
    expect(() =>
      validateTaskRecurrence({ ...base, startOffsetDays: 366 })
    ).toThrow();
    expect(() =>
      validateTaskRecurrence({ ...base, startOffsetDays: -1 })
    ).toThrow();
    expect(validateTaskRecurrence({ ...base, dueTime: '09:30' }).dueTime).toBe(
      '09:30'
    );
  });
});

describe('task occurrence dates', () => {
  it('steps daily intervals and honors exclusive and inclusive bounds', () => {
    const s = schedule('2026-01-01', { interval: 3 });
    expect(list(s, 3)).toEqual(['2026-01-01', '2026-01-04', '2026-01-07']);
    expect(nextTaskOccurrenceDate(s, { after: '2026-01-04' })).toBe(
      '2026-01-07'
    );
    expect(nextTaskOccurrenceDate(s, { onOrAfter: '2026-01-04' })).toBe(
      '2026-01-04'
    );
    expect(isTaskOccurrenceDate(s, '2026-01-05')).toBe(false);
  });

  it('selects weekdays within interval weeks from the week start', () => {
    const s = schedule('2026-11-16', {
      frequency: 'weekly',
      interval: 2,
      weekdays: ['MO', 'TH'],
    });
    expect(list(s, 5)).toEqual([
      '2026-11-16',
      '2026-11-19',
      '2026-11-30',
      '2026-12-03',
      '2026-12-14',
    ]);
  });

  it('clamps day 31 to the last day of short months, including leap February', () => {
    expect(list(schedule('2026-01-31', monthly31), 5)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(list(schedule('2028-01-31', monthly31), 2)[1]).toBe('2028-02-29');
    expect(
      list(schedule('2026-01-30', { ...monthly31, monthDay: 30 }), 3)
    ).toEqual(['2026-01-30', '2026-02-28', '2026-03-30']);
  });

  it('keeps a February 29 yearly task on the last day of February', () => {
    const s = schedule('2028-02-29', {
      frequency: 'yearly',
      month: 2,
      monthDay: 29,
      monthDayOverflow: 'last-day',
    });
    expect(list(s, 5)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('ends after COUNT occurrences even when queried past the start', () => {
    const s = schedule('2026-01-01', { end: { type: 'count', count: 3 } });
    expect(list(s, 10)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(list(s, 10, '2026-01-03')).toEqual(['2026-01-03']);
    expect(nextTaskOccurrenceDate(s, { after: '2026-01-03' })).toBeNull();
  });

  it('includes the UNTIL date and stops after it', () => {
    const s = schedule('2026-01-05', {
      frequency: 'weekly',
      weekdays: ['MO'],
      end: { type: 'until', date: '2026-01-19' },
    });
    expect(list(s, 10)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('jumps to far-future bounds without walking history', () => {
    const s = schedule('2026-01-01');
    expect(nextTaskOccurrenceDate(s, { after: '2125-06-30' })).toBe(
      '2125-07-01'
    );
    const monthly = schedule('2026-01-31', { ...monthly31, interval: 7 });
    expect(nextTaskOccurrenceDate(monthly, { onOrAfter: '2100-01-01' })).toBe(
      list(monthly, 1000).find((date) => date >= '2100-01-01')
    );
  });

  it.each<[string, Partial<CalendarRecurrenceRule>]>([
    ['daily', { interval: 2 }],
    [
      'weekly',
      {
        frequency: 'weekly',
        interval: 3,
        weekdays: ['TU', 'SA'],
        weekStartsOn: 'SU',
      },
    ],
    ['monthly', { ...monthly31, interval: 2 }],
    [
      'yearly',
      {
        frequency: 'yearly',
        month: 1,
        monthDay: 31,
        monthDayOverflow: 'last-day',
      },
    ],
  ])(
    'agrees with the calendar expansion engine for %s rules',
    (_, overrides) => {
      const s = schedule('2026-01-31', overrides);
      if (overrides.frequency === 'weekly') s.anchorDate = '2026-02-03';
      const expected = expandCalendarRecurrence({
        rule: s.rule as CalendarRecurrenceRule,
        anchor: taskRecurrenceAllDayAnchor(s.anchorDate),
        from: '2026-01-01T00:00:00Z',
        to: '2031-01-01T00:00:00Z',
        limit: 1000,
      }).occurrences.map((o) => o.originalStartLocal.slice(0, 10));
      expect(list(s, 1000).filter((d) => d < '2031-01-01')).toEqual(expected);
    }
  );
});

describe('snapTaskRecurrenceAnchor', () => {
  it('moves to the first matching date on or after the start date', () => {
    const weekdays = rule({
      frequency: 'weekly',
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
    });
    expect(snapTaskRecurrenceAnchor(weekdays, '2026-11-21')).toBe('2026-11-23');
    expect(snapTaskRecurrenceAnchor(weekdays, '2026-11-20')).toBe('2026-11-20');
    const monthly = rule({
      frequency: 'monthly',
      monthDay: 5,
      monthDayOverflow: 'last-day',
      interval: 2,
    });
    expect(snapTaskRecurrenceAnchor(monthly, '2026-01-20')).toBe('2026-03-05');
    const biweekly = rule({
      frequency: 'weekly',
      interval: 2,
      weekdays: ['MO'],
    });
    expect(snapTaskRecurrenceAnchor(biweekly, '2026-11-17')).toBe('2026-11-30');
  });
});
