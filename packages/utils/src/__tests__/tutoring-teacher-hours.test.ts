import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';
import { createDefaultHoursSettings } from '../../../../apps/calendar/src/components/settings/calendar/hour-settings-shared';
import {
  assessTeacherHoursSlot,
  type HoursSlot,
  resetTeacherHoursOverride,
  resolveTeacherHours,
  type StaffHours,
  validateHoursFrame,
  validateHoursWeek,
  validateHoursWriteReceipt,
} from '../tutoring-teacher-hours';

const defaults: StaffHours = {
  revision: '900719925474099312345',
  frame: { timeZone: 'Asia/Ho_Chi_Minh', confirmed: true },
  week: { 1: [{ start: '09:00', end: '17:00' }], 2: [] },
};
const monday: HoursSlot = {
  date: '2026-10-05',
  start: '09:00',
  endDate: '2026-10-05',
  end: '10:00',
};
const decide = (slot: HoursSlot, hours = defaults) =>
  assessTeacherHoursSlot(hours, null, slot).state;

describe('teacher-hours authority and per-day inheritance', () => {
  it('does not turn Calendar auto-created defaults into confirmed teacher hours', () => {
    // Actual Calendar producer is valid for its own product, not teacher consent.
    const calendar = createDefaultHoursSettings().workHours;
    expect(calendar.monday).toEqual({
      enabled: true,
      timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
    });
    expect(
      resolveTeacherHours(null, null).every((day) => day.state === 'unknown')
    ).toBe(true);
    expect(assessTeacherHoursSlot(null, null, monday)).toEqual({
      state: 'unknown',
    });
  });

  it('distinguishes missing staff day from explicitly closed day', () => {
    const week = resolveTeacherHours(defaults, null);
    expect(week[0]).toMatchObject({ state: 'hours', source: 'default' });
    expect(week[1]).toMatchObject({ state: 'closed', source: 'default' });
    expect(week[2]).toMatchObject({ state: 'unknown', source: 'unknown' });
  });

  it('replaces, never unions, one overridden day and inherits absent weekdays', () => {
    const week = resolveTeacherHours(defaults, {
      revision: 'override:1',
      week: { 1: [{ start: '18:00', end: '20:00' }] },
    });
    expect(week[0]?.intervals).toEqual([{ start: '18:00', end: '20:00' }]);
    expect(week[0]?.source).toBe('override');
    expect(week[1]?.state).toBe('closed');
  });

  it('explicit empty override closes the day; removing it inherits latest default', () => {
    expect(
      resolveTeacherHours(defaults, { revision: 'a', week: { 1: [] } })[0]
        ?.state
    ).toBe('closed');
    const reset = resetTeacherHoursOverride('a', 'b');
    expect(reset).toEqual({ revision: 'b', week: {} });
    expect(
      resolveTeacherHours({ ...defaults, week: { 1: [] } }, reset)[0]?.state
    ).toBe('closed');
    expect(resolveTeacherHours(defaults, reset)[0]?.state).toBe('hours');
  });

  it('cannot use custom overrides without a confirmed staff timezone', () => {
    expect(
      resolveTeacherHours(null, {
        revision: 'a',
        week: { 1: [{ start: '09:00', end: '17:00' }] },
      })[0]?.state
    ).toBe('unknown');
  });

  it('returns defensive interval copies', () => {
    const week = resolveTeacherHours(defaults, null);
    expect(week[0]?.intervals[0]).not.toBe(defaults.week[1]?.[0]);
  });
});

describe('lossless receipt and reset contract', () => {
  it('retains opaque revisions above JS safe precision and tombstone after reset', () => {
    const before = '900719925474099312345';
    const after = '900719925474099312346';
    expect(Number(before)).toBe(Number(after));
    const reset = resetTeacherHoursOverride(before, after);
    expect(reset.revision).toBe(after);
    expect(reset.week).toEqual({});
    expect(resetTeacherHoursOverride(null, before).revision).toBe(before);
  });

  it('rejects reused same-content receipt revisions and malformed revisions', () => {
    expect(() => validateHoursWriteReceipt('a', 'a')).toThrow();
    expect(() => validateHoursWriteReceipt('a', '')).toThrow();
    expect(() => validateHoursWriteReceipt(' ', 'b')).toThrow();
    expect(() => validateHoursWriteReceipt(null, 'b')).not.toThrow();
    // No pure helper claims to enforce storage CAS: stale/reset ABA needs atomic DB proof.
  });
});

describe('strict frame and weekly window validation', () => {
  it.each(['auto', '', '+07:00', 'Not/AZone'])(
    'rejects nonconfirmed IANA frame %s',
    (timeZone) => {
      expect(() => validateHoursFrame({ timeZone, confirmed: true })).toThrow();
    }
  );
  it.each(['Asia/Ho_Chi_Minh', 'America/New_York', 'UTC', 'Etc/GMT+7'])(
    'accepts confirmed DB-supported frame %s',
    (timeZone) => {
      expect(() =>
        validateHoursFrame({ timeZone, confirmed: true })
      ).not.toThrow();
    }
  );
  it('rejects unconfirmed valid timezone', () => {
    expect(() =>
      validateHoursFrame({ timeZone: 'UTC', confirmed: false } as never)
    ).toThrow();
  });
  it.each([
    { 0: [] },
    { 8: [] },
    { 1: [{ start: '9:00', end: '10:00' }] },
    { 1: [{ start: '24:00', end: '24:00' }] },
    { 1: [{ start: '10:00', end: '09:00' }] },
    {
      1: [
        { start: '09:00', end: '11:00' },
        { start: '10:00', end: '12:00' },
      ],
    },
    {
      1: [
        { start: '12:00', end: '13:00' },
        { start: '09:00', end: '10:00' },
      ],
    },
  ])('rejects malformed/overlapping/unsorted week %j', (week) => {
    expect(() => validateHoursWeek(week)).toThrow();
  });
  it('allows half-open adjacency and explicit midnight end', () => {
    expect(() =>
      validateHoursWeek({
        1: [
          { start: '00:00', end: '12:00' },
          { start: '12:00', end: '24:00' },
        ],
      })
    ).not.toThrow();
  });
});

describe('strict storage window parity', () => {
  it('rejects extra untyped properties, null blocks and numeric clocks', () => {
    expect(() =>
      validateHoursWeek({
        1: [{ start: '09:00', end: '10:00', extra: 'untyped' }],
      } as never)
    ).toThrow();
    expect(() => validateHoursWeek({ 1: [null] } as never)).toThrow();
    expect(() =>
      validateHoursWeek({ 1: [{ start: 9, end: '10:00' }] } as never)
    ).toThrow();
  });
});

describe('candidate coverage and actual Temporal boundary', () => {
  it('allows exact boundaries and rejects outside hours', () => {
    expect(decide({ ...monday, end: '17:00' })).toBe('allowed');
    expect(decide({ ...monday, start: '08:59' })).toBe('closed');
    expect(decide({ ...monday, end: '17:01' })).toBe('closed');
    expect(
      decide({ ...monday, date: '2026-10-07', endDate: '2026-10-07' })
    ).toBe('unknown');
  });
  it('covers adjacent intervals continuously without bridging a gap', () => {
    const week = {
      1: [
        { start: '09:00', end: '10:00' },
        { start: '10:00', end: '11:00' },
      ],
    };
    expect(decide({ ...monday, end: '11:00' }, { ...defaults, week })).toBe(
      'allowed'
    );
    week[1][1] = { start: '10:01', end: '11:00' };
    expect(decide({ ...monday, end: '11:00' }, { ...defaults, week })).toBe(
      'closed'
    );
  });
  it('requires explicit coverage on both days for overnight and Sunday wrap', () => {
    const slot = {
      date: '2026-10-11',
      start: '23:00',
      endDate: '2026-10-12',
      end: '01:00',
    };
    const hours = {
      ...defaults,
      week: {
        7: [{ start: '22:00', end: '24:00' }],
        1: [{ start: '00:00', end: '02:00' }],
      },
    };
    expect(decide(slot, hours)).toBe('allowed');
    expect(decide(slot, { ...hours, week: { 7: hours.week[7] } })).toBe(
      'unknown'
    );
    expect(decide(slot, { ...hours, week: { ...hours.week, 1: [] } })).toBe(
      'closed'
    );
    expect(
      decide(
        { ...slot, end: '00:00' },
        { ...hours, week: { 7: hours.week[7] } }
      )
    ).toBe('allowed');
  });
  it('rejects zero/negative/unbounded slots and invalid civil dates', () => {
    for (const slot of [
      { ...monday, end: '09:00' },
      { ...monday, end: '08:00' },
      { ...monday, endDate: '2026-10-13' },
      { ...monday, date: '2026-02-30' },
      { ...monday, start: '9:00' },
    ])
      expect(decide(slot)).toBe('invalid');
  });
  it('proves compatible Temporal conversion would move a nonexistent clock time', () => {
    const local = Temporal.PlainDateTime.from('2026-03-08T02:30');
    expect(local.toZonedDateTime('America/New_York').hour).toBe(3);
    const hours = {
      ...defaults,
      frame: { timeZone: 'America/New_York', confirmed: true as const },
      week: { 7: [{ start: '00:00', end: '24:00' }] },
    };
    expect(
      decide(
        {
          date: '2026-03-08',
          start: '02:30',
          endDate: '2026-03-08',
          end: '04:00',
        },
        hours
      )
    ).toBe('invalid');
    expect(
      decide(
        {
          date: '2026-11-01',
          start: '01:30',
          endDate: '2026-11-01',
          end: '03:00',
        },
        hours
      )
    ).toBe('invalid');
    expect(
      decide(
        {
          date: '2026-03-08',
          start: '01:00',
          endDate: '2026-03-08',
          end: '04:00',
        },
        hours
      )
    ).toBe('invalid');
    expect(
      decide(
        {
          date: '2026-11-01',
          start: '00:30',
          endDate: '2026-11-01',
          end: '03:00',
        },
        hours
      )
    ).toBe('invalid');
    expect(
      decide(
        {
          date: '2026-03-09',
          start: '09:00',
          endDate: '2026-03-09',
          end: '10:00',
        },
        { ...hours, week: defaults.week }
      )
    ).toBe('allowed');
  });
});
