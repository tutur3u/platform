import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import { describe, expect, it } from 'vitest';
import {
  CalendarRecurrenceRuleSchema,
  expandCalendarRecurrence,
  fromGoogleCalendarRecurrence,
  fromGraphCalendarRecurrence,
  toGoogleCalendarRecurrence,
  toGraphCalendarRecurrence,
  UnsupportedCalendarRecurrenceError,
} from '../calendar-recurrence';

const anchor: CalendarRecurrenceAnchor = {
  startLocal: '2026-01-01T09:00:00',
  endLocal: '2026-01-01T10:00:00',
  allDay: false,
};
const daily: CalendarRecurrenceRule = {
  version: 1,
  frequency: 'daily',
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'never' },
};
const expand = (
  rule: CalendarRecurrenceRule,
  options: Partial<Parameters<typeof expandCalendarRecurrence>[0]> = {}
) =>
  expandCalendarRecurrence({
    rule,
    anchor,
    from: '2026-01-01T00:00:00Z',
    to: '2026-02-01T00:00:00Z',
    ...options,
  });
const patterns: CalendarRecurrenceRule[] = [
  daily,
  {
    ...daily,
    frequency: 'weekly',
    interval: 2,
    weekdays: ['MO', 'FR'],
    weekStartsOn: 'SU',
  },
  {
    ...daily,
    frequency: 'monthly',
    monthDay: 31,
    monthDayOverflow: 'last-day',
  },
  { ...daily, frequency: 'monthly', weekdays: ['TH'], weekIndex: 2 },
  { ...daily, frequency: 'monthly', weekdays: ['TH', 'FR'], weekIndex: -1 },
  {
    ...daily,
    frequency: 'yearly',
    month: 2,
    monthDay: 29,
    monthDayOverflow: 'last-day',
  },
  { ...daily, frequency: 'yearly', month: 11, weekdays: ['MO'], weekIndex: 1 },
];

describe('common provider recurrence contract', () => {
  for (const [index, pattern] of patterns.entries()) {
    for (const end of [
      { type: 'never' },
      { type: 'count', count: 8 },
      { type: 'until', date: '2028-12-31' },
    ] as const) {
      it(`round trips pattern ${index} / ${end.type} through Google and Graph`, () => {
        const rule = { ...pattern, end };
        const dates = [
          '2026-01-01',
          '2026-01-02',
          '2026-01-31',
          '2026-01-08',
          '2026-01-29',
          '2028-02-29',
          '2026-11-02',
        ];
        const patternAnchor = {
          ...anchor,
          startLocal: `${dates[index]}T09:00:00`,
          endLocal: `${dates[index]}T10:00:00`,
        };
        expect(
          fromGraphCalendarRecurrence(
            toGraphCalendarRecurrence(rule, patternAnchor),
            rule.timeZone
          )
        ).toEqual(rule);
        const imported = fromGoogleCalendarRecurrence(
          toGoogleCalendarRecurrence(rule, patternAnchor),
          patternAnchor,
          rule.timeZone
        );
        expect(imported).toEqual(rule);
      });
    }
  }
  it('uses exclusive all-day dates and inclusive UNTIL day', () => {
    const allDay = {
      startLocal: '2026-01-01T00:00:00',
      endLocal: '2026-01-02T00:00:00',
      allDay: true,
    };
    const rule = {
      ...daily,
      end: { type: 'until', date: '2026-01-03' } as const,
    };
    expect(toGoogleCalendarRecurrence(rule, allDay)).toEqual([
      'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260103',
    ]);
    expect(
      fromGoogleCalendarRecurrence(
        toGoogleCalendarRecurrence(rule, allDay),
        allDay,
        'UTC'
      )
    ).toEqual(rule);
    expect(expand(rule, { anchor: allDay }).occurrences).toHaveLength(3);
  });
  it('converts Google UTC cutoff to the last eligible local day without extending it', () => {
    const rule = fromGoogleCalendarRecurrence(
      ['RRULE:FREQ=DAILY;UNTIL=20260103T085959Z'],
      anchor,
      'UTC'
    );
    expect(rule.end).toEqual({ type: 'until', date: '2026-01-02' });
  });
  it.each([
    ['RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=5'],
    ['RRULE:FREQ=MONTHLY;BYDAY=1MO,1FR'],
    ['RRULE:FREQ=DAILY', 'EXDATE:20260101T090000Z'],
    ['RRULE:FREQ=DAILY;COUNT=2;UNTIL=20260103T000000Z'],
    ['RRULE:FREQ=DAILY;INTERVAL=1;INTERVAL=2'],
  ])('rejects unsupported/lossy provider recurrence %j', (...value) => {
    expect(() => fromGoogleCalendarRecurrence(value, anchor, 'UTC')).toThrow(
      UnsupportedCalendarRecurrenceError
    );
  });
  it.each([
    { ...daily, timeZone: '+07:00' },
    { ...daily, timeZone: 'Invalid/Zone' },
    { ...daily, interval: 0 },
    { ...daily, weekdays: ['MO'] },
    { ...daily, frequency: 'weekly' },
    {
      ...daily,
      frequency: 'monthly',
      monthDay: 1,
      weekdays: ['MO'],
      weekIndex: 1,
    },
    { ...daily, end: { type: 'until', date: '2026-02-30' } },
  ])('rejects invalid rule %j', (rule) =>
    expect(CalendarRecurrenceRuleSchema.safeParse(rule).success).toBe(false)
  );
});

describe('bounded timezone-aware occurrence expansion', () => {
  it('maintains the same wall clock through spring DST', () => {
    const result = expand(
      { ...daily, timeZone: 'America/New_York' },
      {
        anchor: {
          ...anchor,
          startLocal: '2026-03-07T09:00:00',
          endLocal: '2026-03-07T10:00:00',
        },
        from: '2026-03-07T00:00:00Z',
        to: '2026-03-10T00:00:00Z',
      }
    );
    expect(result.occurrences.map((event) => event.start_at)).toEqual([
      '2026-03-07T14:00:00Z',
      '2026-03-08T13:00:00Z',
      '2026-03-09T13:00:00Z',
    ]);
  });
  it('skips nonexistent local times without consuming COUNT', () => {
    const result = expand(
      {
        ...daily,
        timeZone: 'America/New_York',
        end: { type: 'count', count: 2 },
      },
      {
        anchor: {
          ...anchor,
          startLocal: '2026-03-07T02:30:00',
          endLocal: '2026-03-07T03:30:00',
        },
        from: '2026-03-07T00:00:00Z',
        to: '2026-03-11T00:00:00Z',
      }
    );
    expect(result.occurrences.map((event) => event.originalStartLocal)).toEqual(
      ['2026-03-07T02:30:00', '2026-03-09T02:30:00']
    );
  });
  it('uses earlier fold and preserves end wall clock in autumn', () => {
    const result = expand(
      {
        ...daily,
        timeZone: 'America/New_York',
        end: { type: 'count', count: 1 },
      },
      {
        anchor: {
          ...anchor,
          startLocal: '2026-11-01T01:30:00',
          endLocal: '2026-11-01T02:30:00',
        },
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
      }
    );
    expect(result.occurrences[0]).toMatchObject({
      start_at: '2026-11-01T05:30:00Z',
      end_at: '2026-11-01T07:30:00Z',
    });
  });
  it('counts cancellations and moved instances without creating replacement slots', () => {
    const result = expand(
      { ...daily, end: { type: 'count', count: 3 } },
      {
        exceptions: [
          { originalStartLocal: '2026-01-01T09:00:00', cancelled: true },
          {
            originalStartLocal: '2026-01-02T09:00:00',
            startLocal: '2026-01-09T13:00:00',
            endLocal: '2026-01-09T14:00:00',
          },
        ],
      }
    );
    expect(result.occurrences.map((event) => event.originalStartLocal)).toEqual(
      ['2026-01-03T09:00:00', '2026-01-02T09:00:00']
    );
    expect(result.occurrences[1]?.isException).toBe(true);
  });
  it('includes moved instances whose original slot is outside the requested window', () => {
    const result = expand(daily, {
      from: '2026-01-01T12:00:00Z',
      to: '2026-01-01T15:00:00Z',
      exceptions: [
        {
          originalStartLocal: '2026-01-20T09:00:00',
          startLocal: '2026-01-01T13:00:00',
          endLocal: '2026-01-01T14:00:00',
        },
      ],
    });
    expect(result.occurrences.map((event) => event.originalStartLocal)).toEqual(
      ['2026-01-20T09:00:00']
    );
  });
  it('includes events overlapping the range and excludes exact edge boundaries', () => {
    expect(
      expand(daily, {
        from: '2026-01-01T09:30:00Z',
        to: '2026-01-01T09:45:00Z',
      }).occurrences
    ).toHaveLength(1);
    expect(
      expand(daily, {
        from: '2026-01-01T10:00:00Z',
        to: '2026-01-02T09:00:00Z',
      }).occurrences
    ).toHaveLength(0);
  });
  it('skips unavailable month days, including non-leap February', () => {
    const rule = { ...daily, frequency: 'monthly', monthDay: 31 } as const;
    expect(
      expand(rule, {
        anchor: {
          ...anchor,
          startLocal: '2026-01-31T09:00:00',
          endLocal: '2026-01-31T10:00:00',
        },
        to: '2026-05-01T00:00:00Z',
      }).occurrences.map((event) => event.originalStartLocal.slice(0, 10))
    ).toEqual(['2026-01-31', '2026-03-31']);
    expect(
      expand(
        { ...daily, frequency: 'yearly', month: 2, monthDay: 29 },
        {
          anchor: {
            ...anchor,
            startLocal: '2028-02-29T09:00:00',
            endLocal: '2028-02-29T10:00:00',
          },
          to: '2030-01-01T00:00:00Z',
        }
      ).occurrences.map((event) => event.originalStartLocal.slice(0, 10))
    ).toEqual(['2028-02-29']);
  });
  it('handles biweekly recurrence across year and week boundaries', () => {
    expect(
      expand({
        ...daily,
        frequency: 'weekly',
        interval: 2,
        weekdays: ['MO', 'TH'],
        weekStartsOn: 'SU',
      }).occurrences.map((event) => event.originalStartLocal.slice(0, 10))
    ).toEqual([
      '2026-01-01',
      '2026-01-12',
      '2026-01-15',
      '2026-01-26',
      '2026-01-29',
    ]);
  });
  it('selects the earliest matching relative weekday', () => {
    expect(
      expand(
        {
          ...daily,
          frequency: 'monthly',
          weekdays: ['TH', 'FR'],
          weekIndex: 2,
        },
        {
          anchor: {
            ...anchor,
            startLocal: '2026-01-08T09:00:00',
            endLocal: '2026-01-08T10:00:00',
          },
        }
      ).occurrences[0]?.originalStartLocal
    ).toBe('2026-01-08T09:00:00');
  });
  it('preserves Outlook short-month clamping through Google RRULE conversion', () => {
    const rule: CalendarRecurrenceRule = {
      ...daily,
      frequency: 'monthly',
      monthDay: 31,
      monthDayOverflow: 'last-day',
    };
    const monthAnchor = {
      ...anchor,
      startLocal: '2026-01-31T09:00:00',
      endLocal: '2026-01-31T10:00:00',
    };
    expect(toGoogleCalendarRecurrence(rule, monthAnchor)).toEqual([
      'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
    ]);
    expect(
      expand(rule, {
        anchor: monthAnchor,
        to: '2026-05-01T00:00:00Z',
      }).occurrences.map((event) => event.originalStartLocal.slice(0, 10))
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(() =>
      toGraphCalendarRecurrence(
        { ...rule, monthDayOverflow: 'skip' },
        monthAnchor
      )
    ).toThrow(UnsupportedCalendarRecurrenceError);
  });
  it('rejects duplicate exception keys and incomplete moved times', () => {
    expect(() =>
      expand(daily, {
        exceptions: [
          { originalStartLocal: anchor.startLocal },
          { originalStartLocal: anchor.startLocal, cancelled: true },
        ],
      })
    ).toThrow('Duplicate');
    expect(() =>
      expand(daily, {
        exceptions: [
          {
            originalStartLocal: anchor.startLocal,
            startLocal: '2026-01-01T13:00:00',
          },
        ],
      })
    ).toThrow('Moved occurrences require');
  });
  it('does not resurrect a moved original slot beyond the counted series', () => {
    const result = expand(
      { ...daily, end: { type: 'count', count: 1 } },
      {
        exceptions: [
          {
            originalStartLocal: '2026-01-20T09:00:00',
            startLocal: '2026-01-01T13:00:00',
            endLocal: '2026-01-01T14:00:00',
          },
        ],
      }
    );
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]?.originalStartLocal).toBe(anchor.startLocal);
  });
  it('rejects a series anchor outside its pattern instead of inserting an extra first occurrence', () => {
    expect(() =>
      expand({ ...daily, frequency: 'weekly', weekdays: ['MO'] })
    ).toThrow('anchor must match');
    expect(() =>
      fromGoogleCalendarRecurrence(
        ['RRULE:FREQ=WEEKLY;BYDAY=1MO'],
        anchor,
        'UTC'
      )
    ).toThrow(UnsupportedCalendarRecurrenceError);
  });
  it('reports truncation explicitly instead of claiming completeness', () => {
    const result = expand(daily, { limit: 2 });
    expect(result.occurrences).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
  it('rejects an unbounded historical scan and invalid request limits', () => {
    expect(() => expand(daily, { to: '2200-01-01T00:00:00Z' })).toThrow(
      '100 years'
    );
    expect(() => expand(daily, { limit: 1001 })).toThrow('1–1000');
  });
  it('uses 23-hour all-day duration across DST with exclusive end boundary', () => {
    const result = expand(
      {
        ...daily,
        timeZone: 'America/New_York',
        end: { type: 'count', count: 1 },
      },
      {
        anchor: {
          startLocal: '2026-03-08T00:00:00',
          endLocal: '2026-03-09T00:00:00',
          allDay: true,
        },
        from: '2026-03-08T00:00:00Z',
        to: '2026-03-10T00:00:00Z',
      }
    );
    expect(result.occurrences[0]).toMatchObject({
      start_at: '2026-03-08T05:00:00Z',
      end_at: '2026-03-09T04:00:00Z',
      is_all_day: true,
    });
  });
});
