import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  planTaskRecurrenceGeneration,
  type TaskRecurrenceSchedule,
  taskOccurrenceInstants,
} from '../task-recurrence';

const schedule = (
  anchorDate: string,
  overrides: Partial<CalendarRecurrenceRule> = {},
  timing: Partial<
    Pick<TaskRecurrenceSchedule, 'dueTime' | 'startOffsetDays'>
  > = {}
): TaskRecurrenceSchedule => ({
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'UTC',
    end: { type: 'never' },
    ...overrides,
  },
  anchorDate,
  dueTime: null,
  startOffsetDays: 0,
  ...timing,
});
const instants = (
  timeZone: string,
  date: string,
  dueTime: string | null,
  startOffsetDays = 0
) => taskOccurrenceInstants({ timeZone, dueTime, startOffsetDays }, date);

describe('taskOccurrenceInstants', () => {
  it('validates its inputs', () => {
    expect(() => instants('Mars/Olympus', '2026-11-17', null)).toThrow(
      ZodError
    );
    expect(() => instants('UTC', '2026-11-17', '25:00')).toThrow(ZodError);
    expect(() => instants('UTC', '2026-11-17', null, 400)).toThrow(ZodError);
    expect(() => instants('UTC', '2026-02-30', null)).toThrow(ZodError);
  });

  it('uses the end of the local day when no due time is set', () => {
    expect(instants('Asia/Ho_Chi_Minh', '2026-11-17', null)).toEqual({
      occurrenceDate: '2026-11-17',
      startDate: '2026-11-17',
      startAt: '2026-11-17T16:59:59.999Z',
      endAt: '2026-11-17T16:59:59.999Z',
      generateAt: '2026-11-16T17:00:00Z',
    });
  });

  it('keeps 23-hour and 25-hour local days whole', () => {
    expect(instants('America/New_York', '2026-03-08', null).endAt).toBe(
      '2026-03-09T03:59:59.999Z'
    );
    expect(instants('America/New_York', '2026-11-01', null).endAt).toBe(
      '2026-11-02T04:59:59.999Z'
    );
    expect(instants('Europe/Berlin', '2026-03-29', null)).toMatchObject({
      endAt: '2026-03-29T21:59:59.999Z',
      generateAt: '2026-03-28T23:00:00Z',
    });
  });

  it.each([
    ['America/New_York', '2026-03-08', '02:30', '2026-03-08T07:30:00Z'],
    ['Europe/Berlin', '2026-03-29', '02:30', '2026-03-29T01:30:00Z'],
  ])('moves a %s spring-gap due time forward', (zone, date, time, expected) => {
    expect(instants(zone, date, time).endAt).toBe(expected);
  });

  it.each([
    ['America/New_York', '2026-11-01', '01:30', '2026-11-01T05:30:00Z'],
    ['Europe/Berlin', '2026-10-25', '02:30', '2026-10-25T00:30:00Z'],
  ])(
    'uses the earlier instant for a %s autumn fold',
    (zone, date, time, expected) => {
      expect(instants(zone, date, time).endAt).toBe(expected);
    }
  );

  it('starts generation at the first instant of a day whose midnight is skipped', () => {
    expect(instants('America/Santiago', '2026-09-06', null).generateAt).toBe(
      '2026-09-06T04:00:00Z'
    );
  });

  it('applies the start offset in local days across a DST change', () => {
    expect(instants('America/New_York', '2026-03-10', '09:00', 3)).toEqual({
      occurrenceDate: '2026-03-10',
      startDate: '2026-03-07',
      startAt: '2026-03-07T14:00:00Z',
      endAt: '2026-03-10T13:00:00Z',
      generateAt: '2026-03-07T05:00:00Z',
    });
  });
});

describe('planTaskRecurrenceGeneration', () => {
  const daily = schedule('2026-11-01', { timeZone: 'Asia/Ho_Chi_Minh' });

  it('waits until 00:00 local on the start date', () => {
    const plan = planTaskRecurrenceGeneration(
      daily,
      '2026-11-18',
      '2026-11-17T16:59:59Z'
    );
    expect(plan).toEqual({
      status: 'waiting',
      next: expect.objectContaining({
        occurrenceDate: '2026-11-18',
        generateAt: '2026-11-17T17:00:00Z',
      }),
    });
    expect(
      planTaskRecurrenceGeneration(daily, '2026-11-18', '2026-11-17T17:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-18' },
      skipped: 0,
      next: { occurrenceDate: '2026-11-19' },
    });
  });

  it('creates only the latest due occurrence after downtime', () => {
    expect(
      planTaskRecurrenceGeneration(daily, '2026-11-05', '2026-11-17T03:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-17' },
      skipped: 12,
      next: { occurrenceDate: '2026-11-18' },
    });
  });

  it('opens the window early by the start offset', () => {
    const offset = { ...daily, startOffsetDays: 2 };
    expect(
      planTaskRecurrenceGeneration(offset, '2026-11-19', '2026-11-17T03:00:00Z')
    ).toMatchObject({ status: 'due', due: { occurrenceDate: '2026-11-19' } });
  });

  it('finds the latest due date of sparse rules after long downtime', () => {
    const triennial = schedule('2020-01-31', {
      frequency: 'monthly',
      interval: 7,
      monthDay: 31,
      monthDayOverflow: 'last-day',
    });
    expect(
      planTaskRecurrenceGeneration(
        triennial,
        '2020-01-31',
        '2026-11-17T00:00:00Z'
      )
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-06-30' },
      skipped: 11,
      next: { occurrenceDate: '2027-01-31' },
    });
  });

  it('caps the skipped count without walking unbounded history', () => {
    const plan = planTaskRecurrenceGeneration(
      schedule('2020-01-01'),
      '2020-01-01',
      '2026-11-17T12:00:00Z'
    );
    expect(plan).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-17' },
      skipped: 1000,
    });
  });

  it('ends after COUNT and UNTIL', () => {
    const counted = schedule('2026-11-15', {
      end: { type: 'count', count: 3 },
    });
    expect(
      planTaskRecurrenceGeneration(
        counted,
        '2026-11-16',
        '2026-11-30T00:00:00Z'
      )
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-17' },
      next: null,
    });
    expect(
      planTaskRecurrenceGeneration(
        counted,
        '2026-11-18',
        '2026-11-30T00:00:00Z'
      )
    ).toEqual({ status: 'ended' });
    expect(planTaskRecurrenceGeneration(counted, null, new Date())).toEqual({
      status: 'ended',
    });
    const until = schedule('2026-11-15', {
      end: { type: 'until', date: '2026-11-17' },
    });
    expect(
      planTaskRecurrenceGeneration(until, '2026-11-17', '2026-11-17T00:00:00Z')
    ).toMatchObject({ status: 'due', next: null });
  });

  it('creates the final occurrence when downtime ran past UNTIL', () => {
    const until = schedule('2026-11-01', {
      end: { type: 'until', date: '2026-11-10' },
    });
    expect(
      planTaskRecurrenceGeneration(until, '2026-11-05', '2026-11-17T00:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-10' },
      skipped: 5,
      next: null,
    });
  });

  it('creates lead-time occurrences in order instead of skipping them', () => {
    const lead = { ...daily, anchorDate: '2026-11-17', startOffsetDays: 3 };
    expect(
      planTaskRecurrenceGeneration(lead, '2026-11-17', '2026-11-17T01:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-17' },
      skipped: 0,
      next: { occurrenceDate: '2026-11-18' },
    });
    // After downtime, only overdue dates are skipped; today's is created.
    expect(
      planTaskRecurrenceGeneration(lead, '2026-11-17', '2026-11-25T01:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-25' },
      skipped: 8,
    });
  });

  it.each([
    [
      'America/New_York',
      '2026-03-08',
      '2026-03-08T04:59:59Z',
      '2026-03-08T05:00:00Z',
    ],
    [
      'America/New_York',
      '2026-11-01',
      '2026-11-01T03:59:59Z',
      '2026-11-01T04:00:00Z',
    ],
    [
      'Europe/Berlin',
      '2026-03-29',
      '2026-03-28T22:59:59Z',
      '2026-03-28T23:00:00Z',
    ],
    [
      'Europe/Berlin',
      '2026-10-25',
      '2026-10-24T21:59:59Z',
      '2026-10-24T22:00:00Z',
    ],
  ])(
    'switches from waiting to due at local midnight in %s on %s',
    (zone, date, before, at) => {
      const s = schedule('2026-01-01', { timeZone: zone });
      expect(planTaskRecurrenceGeneration(s, date, before).status).toBe(
        'waiting'
      );
      expect(planTaskRecurrenceGeneration(s, date, at)).toMatchObject({
        status: 'due',
        due: { occurrenceDate: date },
        skipped: 0,
      });
    }
  );

  it('finds the latest past date of a sparse weekly rule after downtime', () => {
    const sparse = schedule('2026-01-05', {
      frequency: 'weekly',
      interval: 3,
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      timeZone: 'Europe/Berlin',
    });
    // Active weeks start 2026-01-05, 01-26, 02-16, ...; 2026-11-16 is active
    // (week 45), so 2026-11-17 is itself an occurrence.
    expect(
      planTaskRecurrenceGeneration(sparse, '2026-01-05', '2026-11-17T12:00:00Z')
    ).toMatchObject({ status: 'due', due: { occurrenceDate: '2026-11-17' } });
    // 2026-11-24 is in an inactive week: the latest past date is 2026-11-22.
    expect(
      planTaskRecurrenceGeneration(sparse, '2026-01-05', '2026-11-24T12:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-22' },
      next: { occurrenceDate: '2026-12-07' },
    });
  });

  it('skips into the middle of a COUNT series and ends at its last date', () => {
    const counted = schedule('2026-11-01', {
      end: { type: 'count', count: 30 },
    });
    expect(
      planTaskRecurrenceGeneration(
        counted,
        '2026-11-03',
        '2026-11-17T12:00:00Z'
      )
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2026-11-17' },
      skipped: 14,
      next: { occurrenceDate: '2026-11-18' },
    });
    expect(
      planTaskRecurrenceGeneration(
        counted,
        '2026-11-03',
        '2027-01-01T00:00:00Z'
      )
    ).toMatchObject({ due: { occurrenceDate: '2026-11-30' }, next: null });
  });

  it('ends a yearly UNTIL series after downtime at its final date', () => {
    const yearly = schedule('2026-02-28', {
      frequency: 'yearly',
      month: 2,
      monthDay: 31,
      monthDayOverflow: 'last-day',
      end: { type: 'until', date: '2030-12-31' },
    });
    expect(
      planTaskRecurrenceGeneration(yearly, '2027-02-28', '2031-06-01T00:00:00Z')
    ).toMatchObject({
      status: 'due',
      due: { occurrenceDate: '2030-02-28' },
      skipped: 3,
      next: null,
    });
  });

  it('rejects a cursor that is not an occurrence date', () => {
    const weekly = schedule('2026-11-16', {
      frequency: 'weekly',
      weekdays: ['MO'],
    });
    expect(() =>
      planTaskRecurrenceGeneration(weekly, '2026-11-17', '2026-11-17T00:00:00Z')
    ).toThrow(/cursor/);
  });
});
