import type { TutoringSessionRecord } from '@tuturuuu/internal-api';
import {
  EASY_CENTER_TUTORING_POLICY,
  STANDARD_TUTORING_POLICY,
} from '@tuturuuu/internal-api/tutoring-policy';
import { describe, expect, it } from 'vitest';
import {
  addDaysToIsoDate,
  buildTutoringSessionQuery,
  buildTutoringStatQuery,
  canExportTutoringFormat,
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
  tutoringQueueFilterGroups,
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
    expect(resolveTutoringDateBounds('tomorrow', today)).toEqual({
      fromDate: '2026-08-30',
      toDate: '2026-08-30',
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
    for (const range of [
      'upcoming',
      'today',
      'tomorrow',
      'week',
      'month',
    ] as const) {
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

it('supports previous month and inclusive custom bounds', () => {
  expect(resolveTutoringDateBounds('lastMonth', '2026-01-15')).toEqual({
    fromDate: '2025-12-01',
    toDate: '2025-12-31',
  });
  expect(
    resolveTutoringDateBounds('custom', '2026-10-30', {
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    })
  ).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-31' });
});

describe('canExportTutoringFormat', () => {
  const today = '2026-11-04';

  it('blocks the detailed sheet on open-ended ranges with no dates', () => {
    for (const dateRange of ['upcoming', 'past', 'all'] as const) {
      const query = buildTutoringSessionQuery(
        { ...DEFAULT_SESSION_FILTERS, dateRange },
        today
      );
      expect(canExportTutoringFormat(query, 'detailed')).toBe(false);
    }
    expect(canExportTutoringFormat({ fromDate: today }, 'detailed')).toBe(
      false
    );
    expect(canExportTutoringFormat({ toDate: today }, 'detailed')).toBe(false);
  });

  it('exports the detailed sheet for a closed range of at most 366 days', () => {
    expect(
      canExportTutoringFormat(
        { fromDate: '2026-11-01', toDate: '2026-11-30' },
        'detailed'
      )
    ).toBe(true);
    expect(
      canExportTutoringFormat({ fromDate: today, toDate: today }, 'detailed')
    ).toBe(true);
    // 2025-11-05 .. 2026-11-05 spans 366 days inclusive.
    expect(
      canExportTutoringFormat(
        { fromDate: '2025-11-05', toDate: '2026-11-05' },
        'detailed'
      )
    ).toBe(true);
    // One day more is 367 days inclusive.
    expect(
      canExportTutoringFormat(
        { fromDate: '2025-11-04', toDate: '2026-11-05' },
        'detailed'
      )
    ).toBe(false);
    expect(
      canExportTutoringFormat(
        { fromDate: '2026-11-30', toDate: '2026-11-01' },
        'detailed'
      )
    ).toBe(false);
  });

  it('applies the same 366-day bound to both formats', () => {
    for (const format of ['detailed', 'payroll'] as const) {
      expect(
        canExportTutoringFormat(
          { fromDate: '2025-11-05', toDate: '2026-11-05' },
          format
        )
      ).toBe(true);
      expect(
        canExportTutoringFormat(
          { fromDate: '2025-11-04', toDate: '2026-11-05' },
          format
        )
      ).toBe(false);
    }
  });

  it('keeps payroll to a closed range of at most 366 days', () => {
    expect(
      canExportTutoringFormat(
        buildTutoringSessionQuery(DEFAULT_SESSION_FILTERS, today),
        'payroll'
      )
    ).toBe(false);
    expect(
      canExportTutoringFormat(
        { fromDate: '2026-11-01', toDate: '2026-11-30' },
        'payroll'
      )
    ).toBe(true);
    expect(
      canExportTutoringFormat(
        { fromDate: '2026-11-30', toDate: '2026-11-01' },
        'payroll'
      )
    ).toBe(false);
    expect(
      canExportTutoringFormat(
        { fromDate: '2025-01-01', toDate: '2026-11-30' },
        'payroll'
      )
    ).toBe(false);
  });
});

describe('support queue class filter', () => {
  // Synthetic classes only.
  const groups = [
    { id: 'ddt', name: 'Starters DDT 2' },
    { id: 'kg', name: 'Kindergarten K1' },
    { id: 'english', name: 'English A1' },
  ];

  it('offers no class the policy excludes from all tutoring', () => {
    expect(
      tutoringQueueFilterGroups(EASY_CENTER_TUTORING_POLICY, groups, 'all').map(
        (group) => group.id
      )
    ).toEqual(['english']);
  });

  it('keeps a class still eligible for one reason, and the current filter', () => {
    const scoped = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'weak_support' as const,
          match: 'contains' as const,
          value: 'ddt',
        },
      ],
    };
    expect(tutoringQueueFilterGroups(scoped, groups, 'all')).toHaveLength(3);
    expect(
      tutoringQueueFilterGroups(EASY_CENTER_TUTORING_POLICY, groups, 'ddt').map(
        (group) => group.id
      )
    ).toEqual(['ddt', 'english']);
  });

  it('reads class tags for tag rules', () => {
    const tagPolicy = {
      ...STANDARD_TUTORING_POLICY,
      groupExclusions: [
        {
          scope: 'all' as const,
          match: 'exact' as const,
          value: 'DDT',
          target: 'tag' as const,
        },
      ],
    };
    expect(
      tutoringQueueFilterGroups(
        tagPolicy,
        groups,
        'all',
        new Map([['english', ['DDT']]])
      ).map((group) => group.id)
    ).toEqual(['ddt', 'kg']);
  });
});
