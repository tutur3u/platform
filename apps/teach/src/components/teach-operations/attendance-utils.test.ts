import type {
  TeachAttendanceDaySummary,
  TeachAttendanceEntry,
} from '@tuturuuu/internal-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTENDANCE_STATUSES,
  addMonthsToIsoDate,
  dateEndUtcIso,
  dateStartUtcIso,
  formatDateInTimezone,
  generateWeeklySessions,
  getAttendanceSummary,
  getCalendarGrid,
  getDayTone,
  getWeekdayIndex,
  inferWeekdaysFromSessions,
  isInCourseDateRange,
  parseIsoDate,
  pickInitialAttendanceDate,
  sessionsForDate,
  todayIsoDate,
  toIsoDate,
  toMonthKey,
  toRecurrenceWeekday,
  vietnamMorningSessionIso,
} from './attendance-utils';

// Local-time constructors keep these assertions independent of the runner's
// timezone, matching how the helpers read and write calendar dates.
const local = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

describe('attendance date helpers', () => {
  it('round-trips ISO dates and zero-pads months and days', () => {
    expect(toIsoDate(local(2026, 1, 5))).toBe('2026-01-05');
    expect(toIsoDate(parseIsoDate('2026-12-31'))).toBe('2026-12-31');
    expect(toMonthKey(local(2026, 3, 9))).toBe('2026-03');
  });

  it('adds months and rolls over the year boundary', () => {
    expect(addMonthsToIsoDate('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonthsToIsoDate('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('brackets a day in UTC', () => {
    expect(dateStartUtcIso('2026-10-05')).toBe('2026-10-05T00:00:00.000Z');
    expect(dateEndUtcIso('2026-10-05')).toBe('2026-10-05T23:59:59.999Z');
  });

  it('places morning sessions at 07:00 and 08:00 Vietnam time', () => {
    expect(vietnamMorningSessionIso('2026-10-05', 7)).toBe(
      '2026-10-05T00:00:00.000Z'
    );
    expect(vietnamMorningSessionIso('2026-10-05', 8)).toBe(
      '2026-10-05T01:00:00.000Z'
    );
  });

  it('formats a timestamp as the calendar date in a timezone', () => {
    expect(
      formatDateInTimezone('2026-10-05T20:00:00.000Z', 'Asia/Ho_Chi_Minh')
    ).toBe('2026-10-06');
    expect(formatDateInTimezone('2026-10-05T20:00:00.000Z', 'UTC')).toBe(
      '2026-10-05'
    );
    expect(formatDateInTimezone('2026-10-05T20:00:00.000Z', 'Not/AZone')).toBe(
      '2026-10-05'
    );
  });

  it('indexes weekdays from Monday', () => {
    expect(getWeekdayIndex(local(2026, 10, 5))).toBe(0); // Monday
    expect(getWeekdayIndex(local(2026, 10, 11))).toBe(6); // Sunday
    expect(toRecurrenceWeekday(0)).toBe(1);
    expect(toRecurrenceWeekday(6)).toBe(0);
  });

  it('builds a six-week Monday-first calendar grid', () => {
    const grid = getCalendarGrid(local(2026, 10, 20));

    expect(grid).toHaveLength(42);
    expect(toIsoDate(grid[0] as Date)).toBe('2026-09-28');
    expect(toIsoDate(grid[41] as Date)).toBe('2026-11-08');

    // November 2026 starts on a Sunday, so the grid backs up six days.
    expect(toIsoDate(getCalendarGrid(local(2026, 11, 1))[0] as Date)).toBe(
      '2026-10-26'
    );
  });
});

describe('pickInitialAttendanceDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(local(2026, 10, 15));
  });
  afterEach(() => vi.useRealTimers());

  it('formats today from the local clock', () => {
    expect(todayIsoDate()).toBe('2026-10-15');
  });

  it('prefers a session today, then the next one, then the latest past one', () => {
    expect(
      pickInitialAttendanceDate([
        '2026-10-20T00:00:00Z',
        '2026-10-15T08:00:00Z',
      ])
    ).toBe('2026-10-15');
    expect(
      pickInitialAttendanceDate(['2026-10-25', '2026-10-20', '2026-10-01'])
    ).toBe('2026-10-20');
    expect(pickInitialAttendanceDate(['2026-10-01', '2026-10-10'])).toBe(
      '2026-10-10'
    );
  });

  it('falls back to today with no sessions', () => {
    expect(pickInitialAttendanceDate([])).toBe('2026-10-15');
  });
});

describe('course schedule helpers', () => {
  it('checks the open-ended course date range', () => {
    const day = local(2026, 10, 15);

    expect(isInCourseDateRange(day)).toBe(true);
    expect(isInCourseDateRange(day, '2026-10-15', '2026-10-15')).toBe(true);
    expect(isInCourseDateRange(day, '2026-10-16')).toBe(false);
    expect(isInCourseDateRange(day, null, '2026-10-14')).toBe(false);
  });

  it('selects the sessions on a date by prefix', () => {
    const sessions = ['2026-10-05T01:00:00Z', '2026-10-06T01:00:00Z'];

    expect(sessionsForDate(sessions, '2026-10-05')).toEqual([sessions[0]]);
    expect(sessionsForDate(sessions, '2026-10-07')).toEqual([]);
  });

  it('infers the weekdays a course already meets', () => {
    expect(
      inferWeekdaysFromSessions([
        '2026-10-05',
        '2026-10-07T01:00:00Z',
        '2026-10-12',
      ])
    ).toEqual(new Set([0, 2]));
  });

  it('generates a session on each selected weekday, inclusive of both ends', () => {
    expect(
      generateWeeklySessions({
        endingDate: '2026-10-14',
        selectedWeekdays: new Set([0, 2]), // Monday and Wednesday
        startingDate: '2026-10-05',
      })
    ).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14']);
    expect(
      generateWeeklySessions({
        endingDate: '2026-10-04',
        selectedWeekdays: new Set([0]),
        startingDate: '2026-10-05',
      })
    ).toEqual([]);
    expect(
      generateWeeklySessions({
        endingDate: '2026-10-20',
        selectedWeekdays: new Set(),
        startingDate: '2026-10-05',
      })
    ).toEqual([]);
  });
});

describe('getAttendanceSummary', () => {
  const entry = (
    userId: string,
    status: TeachAttendanceEntry['status']
  ): TeachAttendanceEntry => ({
    date: '2026-10-05',
    status,
    user_id: userId,
  });

  it('counts saved statuses and treats unmarked learners as not marked', () => {
    expect(
      getAttendanceSummary(
        [entry('a', 'PRESENT'), entry('b', 'ABSENT'), entry('c', 'LATE')],
        ['a', 'b', 'c', 'd'],
        {}
      )
    ).toEqual({ absent: 1, late: 1, notMarked: 1, present: 1, total: 4 });
  });

  it('lets an unsaved draft override the saved status', () => {
    expect(
      getAttendanceSummary([entry('a', 'ABSENT')], ['a', 'b'], {
        a: entry('a', 'PRESENT'),
        b: entry('b', 'LATE'),
      })
    ).toEqual({ absent: 0, late: 1, notMarked: 0, present: 1, total: 2 });
  });

  it('counts a draft reset to NONE as not marked and ignores non-members', () => {
    expect(
      getAttendanceSummary(
        [entry('a', 'PRESENT'), entry('gone', 'ABSENT')],
        ['a'],
        { a: entry('a', 'NONE') }
      )
    ).toEqual({ absent: 0, late: 0, notMarked: 1, present: 0, total: 1 });
  });

  it('only offers the editable statuses', () => {
    expect([...ATTENDANCE_STATUSES]).toEqual(['PRESENT', 'ABSENT', 'LATE']);
  });
});

describe('getDayTone', () => {
  const summary = (
    overrides: Partial<TeachAttendanceDaySummary>
  ): TeachAttendanceDaySummary => ({
    absent: 0,
    date: '2026-10-05',
    late: 0,
    notes: 0,
    present: 0,
    totalMarked: 0,
    ...overrides,
  });

  it('is idle off the schedule, whatever was marked', () => {
    expect(getDayTone(summary({ totalMarked: 3 }), false, 3)).toBe('idle');
  });

  it('is scheduled until someone is marked', () => {
    expect(getDayTone(undefined, true, 3)).toBe('scheduled');
    expect(getDayTone(summary({}), true, 3)).toBe('scheduled');
  });

  it('ranks absent above late above partial above complete', () => {
    expect(
      getDayTone(summary({ absent: 1, late: 1, totalMarked: 3 }), true, 3)
    ).toBe('absent');
    expect(getDayTone(summary({ late: 1, totalMarked: 3 }), true, 3)).toBe(
      'late'
    );
    expect(getDayTone(summary({ present: 2, totalMarked: 2 }), true, 3)).toBe(
      'partial'
    );
    expect(getDayTone(summary({ present: 3, totalMarked: 3 }), true, 3)).toBe(
      'complete'
    );
    expect(getDayTone(summary({ present: 1, totalMarked: 1 }), true, 0)).toBe(
      'complete'
    );
  });
});
