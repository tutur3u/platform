import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  addDaysToIsoDate,
  buildTutoringSessionQuery,
  buildTutoringStatQuery,
  countActiveTutoringFilters,
  DEFAULT_SESSION_FILTERS,
  endOfMonthIsoDate,
  formatSessionTimeRange,
  groupSessionsByDate,
  isTutoringDateRange,
  isTutoringSessionFiltered,
  resolveTutoringDateBounds,
  resolveTutoringSortOrder,
  startOfMonthIsoDate,
  toIsoDate,
} from './tutoring-filters';

describe('iso date helpers', () => {
  it('formats a local date without shifting across the UTC boundary', () => {
    expect(toIsoDate(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01');
    expect(toIsoDate(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToIsoDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addDaysToIsoDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(endOfMonthIsoDate('2028-02-10')).toBe('2028-02-29');
  });

  it('resolves month bounds', () => {
    expect(startOfMonthIsoDate('2026-08-29')).toBe('2026-08-01');
    expect(endOfMonthIsoDate('2026-08-29')).toBe('2026-08-31');
    expect(endOfMonthIsoDate('2026-04-15')).toBe('2026-04-30');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(addDaysToIsoDate('not-a-date', 3)).toBe('not-a-date');
    expect(startOfMonthIsoDate('')).toBe('');
  });
});

describe('resolveTutoringDateBounds', () => {
  const today = '2026-08-29';

  it('bounds each preset', () => {
    expect(resolveTutoringDateBounds('today', today)).toEqual({
      fromDate: today,
      toDate: today,
    });
    expect(resolveTutoringDateBounds('upcoming', today)).toEqual({
      fromDate: today,
    });
    expect(resolveTutoringDateBounds('week', today)).toEqual({
      fromDate: today,
      toDate: '2026-09-04',
    });
    expect(resolveTutoringDateBounds('month', today)).toEqual({
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    });
    expect(resolveTutoringDateBounds('past', today)).toEqual({
      toDate: '2026-08-28',
    });
    expect(resolveTutoringDateBounds('all', today)).toEqual({});
  });

  it('recognises only known ranges', () => {
    expect(isTutoringDateRange('week')).toBe(true);
    expect(isTutoringDateRange('quarter')).toBe(false);
    expect(isTutoringDateRange(null)).toBe(false);
  });
});

describe('buildTutoringSessionQuery', () => {
  const today = '2026-08-29';

  it('drops "all" sentinels and keeps the date bounds', () => {
    expect(buildTutoringSessionQuery(DEFAULT_SESSION_FILTERS, today)).toEqual({
      attendanceStatus: undefined,
      fromDate: today,
      groupId: undefined,
      reasonType: undefined,
      sortOrder: 'asc',
      studentUserId: undefined,
      teacherId: undefined,
    });
  });

  it('forwards every selected filter, including the teacher', () => {
    expect(
      buildTutoringSessionQuery(
        {
          attendanceStatus: 'DONE',
          dateRange: 'today',
          groupId: 'group-1',
          reasonType: 'WEAK_SUPPORT',
          studentUserId: 'student-1',
          teacherUserId: 'teacher-1',
        },
        today
      )
    ).toEqual({
      attendanceStatus: 'DONE',
      fromDate: today,
      groupId: 'group-1',
      reasonType: 'WEAK_SUPPORT',
      sortOrder: 'asc',
      studentUserId: 'student-1',
      teacherId: 'teacher-1',
      toDate: today,
    });
  });
});

describe('resolveTutoringSortOrder', () => {
  it('lists the nearest session first for forward-looking ranges', () => {
    for (const range of ['upcoming', 'today', 'week', 'month'] as const) {
      expect(resolveTutoringSortOrder(range)).toBe('asc');
    }
  });

  it('keeps history newest-first', () => {
    expect(resolveTutoringSortOrder('past')).toBe('desc');
    expect(resolveTutoringSortOrder('all')).toBe('desc');
  });
});

describe('filter state helpers', () => {
  it('counts only non-default facets', () => {
    expect(countActiveTutoringFilters(DEFAULT_SESSION_FILTERS)).toBe(0);
    expect(
      countActiveTutoringFilters({
        ...DEFAULT_SESSION_FILTERS,
        attendanceStatus: 'DONE',
        groupId: 'group-1',
      })
    ).toBe(2);
  });

  it('treats a changed date range as filtered', () => {
    expect(isTutoringSessionFiltered(DEFAULT_SESSION_FILTERS)).toBe(false);
    expect(
      isTutoringSessionFiltered({
        ...DEFAULT_SESSION_FILTERS,
        dateRange: 'past',
      })
    ).toBe(true);
  });
});

describe('buildTutoringStatQuery', () => {
  const today = '2026-08-29';

  it('scopes each headline stat', () => {
    expect(buildTutoringStatQuery('today', today)).toEqual({
      fromDate: today,
      toDate: today,
    });
    expect(buildTutoringStatQuery('pending', today)).toEqual({
      attendanceStatus: 'PENDING',
      fromDate: today,
    });
    expect(buildTutoringStatQuery('completed', today)).toEqual({
      attendanceStatus: 'DONE',
      fromDate: '2026-07-31',
      toDate: today,
    });
    expect(buildTutoringStatQuery('missed', today)).toEqual({
      attendanceStatus: 'NO_SHOW',
      fromDate: '2026-07-31',
      toDate: today,
    });
  });
});

describe('groupSessionsByDate', () => {
  const session = (id: string, date: string) =>
    ({ id, session_date: date }) as TutoringSessionRecord;

  it('preserves API ordering and keeps same-day sessions together', () => {
    expect(
      groupSessionsByDate([
        session('a', '2026-08-29'),
        session('b', '2026-08-28'),
        session('c', '2026-08-29'),
      ])
    ).toEqual([
      {
        date: '2026-08-29',
        items: [session('a', '2026-08-29'), session('c', '2026-08-29')],
      },
      { date: '2026-08-28', items: [session('b', '2026-08-28')] },
    ]);
  });

  it('returns nothing for an empty page', () => {
    expect(groupSessionsByDate([])).toEqual([]);
  });
});

describe('formatSessionTimeRange', () => {
  it('renders a start–end window from the duration', () => {
    expect(formatSessionTimeRange('18:00:00', 45)).toBe('18:00 – 18:45');
    expect(formatSessionTimeRange('09:30', 90)).toBe('09:30 – 11:00');
  });

  it('wraps past midnight instead of printing an invalid hour', () => {
    expect(formatSessionTimeRange('23:30', 60)).toBe('23:30 – 00:30');
  });

  it('falls back to the raw value when the time cannot be parsed', () => {
    expect(formatSessionTimeRange('later', 45)).toBe('later');
  });
});
