import { describe, expect, it } from 'vitest';
import {
  buildDateInTimezone,
  dateInTimezoneToUTCISO,
  formatInTimezone,
  getDatePartsInTimezone,
  parseTaskDateToUTCISO,
  resolveTaskTimezone,
} from '../task-date-timezone';

const HCM = 'Asia/Ho_Chi_Minh';
const NY = 'America/New_York';

describe('resolveTaskTimezone', () => {
  it.each<[string | null | undefined, string]>([
    [HCM, HCM],
    [NY, NY],
    ['UTC', 'UTC'],
    ['Not/AZone', 'UTC'],
    ['', 'UTC'],
    [null, 'UTC'],
    [undefined, 'UTC'],
  ])('resolveTaskTimezone(%j) is %s', (setting, expected) => {
    expect(resolveTaskTimezone(setting)).toBe(expected);
  });
});

describe('buildDateInTimezone', () => {
  it.each<[string, [number, number, number, number, number, string], string]>([
    [
      'a fixed +07:00 zone',
      [2025, 3, 15, 9, 30, HCM],
      '2025-03-15T02:30:00.000Z',
    ],
    [
      'New York in winter (UTC-5)',
      [2025, 1, 15, 9, 0, NY],
      '2025-01-15T14:00:00.000Z',
    ],
    [
      'New York in summer (UTC-4)',
      [2025, 7, 15, 9, 0, NY],
      '2025-07-15T13:00:00.000Z',
    ],
    ['UTC', [2025, 12, 31, 23, 59, 'UTC'], '2025-12-31T23:59:00.000Z'],
    [
      'an invalid zone falling back to UTC',
      [2025, 6, 1, 8, 5, 'Nope/Nope'],
      '2025-06-01T08:05:00.000Z',
    ],
    [
      'single-digit parts being zero padded',
      [2025, 2, 3, 4, 5, 'UTC'],
      '2025-02-03T04:05:00.000Z',
    ],
    ['a leap day', [2024, 2, 29, 0, 0, 'UTC'], '2024-02-29T00:00:00.000Z'],
  ])('builds the instant for %s', (_label, args, expectedIso) => {
    expect(buildDateInTimezone(...args).toISOString()).toBe(expectedIso);
  });
});

describe('getDatePartsInTimezone', () => {
  it.each<[string, string, string, ReturnType<typeof getDatePartsInTimezone>]>([
    [
      'rolls forward to the next day in +07:00',
      '2025-03-15T20:30:00.000Z',
      HCM,
      { year: 2025, month: 3, day: 16, hour: 3, minute: 30 },
    ],
    [
      'rolls back across a year boundary in New York',
      '2025-01-01T03:15:00.000Z',
      NY,
      { year: 2024, month: 12, day: 31, hour: 22, minute: 15 },
    ],
    [
      'is unchanged in UTC',
      '2025-06-10T12:45:00.000Z',
      'UTC',
      { year: 2025, month: 6, day: 10, hour: 12, minute: 45 },
    ],
    [
      'uses the summer offset in New York',
      '2025-07-04T16:00:00.000Z',
      NY,
      { year: 2025, month: 7, day: 4, hour: 12, minute: 0 },
    ],
  ])('%s', (_label, iso, tz, expected) => {
    expect(getDatePartsInTimezone(new Date(iso), tz)).toEqual(expected);
  });

  it('round-trips with buildDateInTimezone', () => {
    for (const tz of [HCM, NY, 'UTC', 'Europe/London']) {
      const parts = getDatePartsInTimezone(
        new Date('2025-10-05T11:20:00.000Z'),
        tz
      );
      const rebuilt = buildDateInTimezone(
        parts.year,
        parts.month,
        parts.day,
        parts.hour,
        parts.minute,
        tz
      );
      expect(rebuilt.toISOString()).toBe('2025-10-05T11:20:00.000Z');
    }
  });
});

describe('dateInTimezoneToUTCISO', () => {
  it.each<[string, [number, number, number, number, number], string, string]>([
    ['+07:00', [2025, 2, 10, 8, 0], HCM, '2025-03-10T01:00:00.000Z'],
    ['New York in winter', [2025, 0, 10, 8, 0], NY, '2025-01-10T13:00:00.000Z'],
    ['New York in summer', [2025, 6, 10, 8, 0], NY, '2025-07-10T12:00:00.000Z'],
    ['UTC', [2025, 11, 25, 0, 0], 'UTC', '2025-12-25T00:00:00.000Z'],
    [
      'an invalid zone falling back to UTC',
      [2025, 4, 5, 6, 7],
      'bogus',
      '2025-05-05T06:07:00.000Z',
    ],
  ])(
    'reads the local calendar fields of the date in %s',
    (_label, [y, monthIndex, d, h, min], tz, expected) => {
      const localDate = new Date(y, monthIndex, d, h, min);
      expect(dateInTimezoneToUTCISO(localDate, tz)).toBe(expected);
    }
  );

  it('ignores seconds and milliseconds of the input', () => {
    const localDate = new Date(2025, 2, 10, 8, 0, 59, 999);
    expect(dateInTimezoneToUTCISO(localDate, 'UTC')).toBe(
      '2025-03-10T08:00:00.000Z'
    );
  });
});

describe('formatInTimezone', () => {
  it.each<[string, Date | string, string, string, string]>([
    [
      'a Date in +07:00',
      new Date('2025-03-15T20:30:00.000Z'),
      HCM,
      'YYYY-MM-DD HH:mm',
      '2025-03-16 03:30',
    ],
    [
      'an ISO string in New York',
      '2025-07-04T16:00:00.000Z',
      NY,
      'YYYY-MM-DD HH:mm',
      '2025-07-04 12:00',
    ],
    [
      'UTC with a custom format',
      '2025-01-02T03:04:05.000Z',
      'UTC',
      'DD/MM/YYYY',
      '02/01/2025',
    ],
    [
      'an invalid zone falling back to UTC',
      '2025-01-02T03:04:05.000Z',
      'wat',
      'HH:mm:ss',
      '03:04:05',
    ],
  ])('formats %s', (_label, input, tz, fmt, expected) => {
    expect(formatInTimezone(input, tz, fmt)).toBe(expected);
  });
});

describe('parseTaskDateToUTCISO', () => {
  it.each<[string, string, string, boolean, string]>([
    [
      'a date-only value at start of day',
      '2025-02-23',
      HCM,
      false,
      '2025-02-22T17:00:00.000Z',
    ],
    [
      'a date-only value at end of day',
      '2025-02-23',
      HCM,
      true,
      '2025-02-23T16:59:59.999Z',
    ],
    [
      'a date-only value in New York winter',
      '2025-02-23',
      NY,
      false,
      '2025-02-23T05:00:00.000Z',
    ],
    [
      'a date-only value in New York summer end of day',
      '2025-07-23',
      NY,
      true,
      '2025-07-24T03:59:59.999Z',
    ],
    [
      'a date-only value with surrounding spaces',
      '  2025-02-23  ',
      'UTC',
      false,
      '2025-02-23T00:00:00.000Z',
    ],
    [
      'a naive datetime',
      '2025-02-23T15:00:00',
      HCM,
      false,
      '2025-02-23T08:00:00.000Z',
    ],
    [
      'a naive datetime ignores endOfDay',
      '2025-02-23T15:00:00',
      HCM,
      true,
      '2025-02-23T08:00:00.000Z',
    ],
    [
      'a Z-suffixed datetime',
      '2025-02-23T15:00:00Z',
      HCM,
      false,
      '2025-02-23T15:00:00.000Z',
    ],
    [
      'a lowercase z-suffixed datetime',
      '2025-02-23T15:00:00z',
      NY,
      false,
      '2025-02-23T15:00:00.000Z',
    ],
    [
      'a positive offset datetime',
      '2025-02-23T15:00:00+07:00',
      NY,
      false,
      '2025-02-23T08:00:00.000Z',
    ],
    [
      'a negative offset datetime',
      '2025-02-23T15:00:00-05:00',
      HCM,
      true,
      '2025-02-23T20:00:00.000Z',
    ],
    [
      'an offset without a colon',
      '2025-02-23T15:00:00+0700',
      'UTC',
      false,
      '2025-02-23T08:00:00.000Z',
    ],
  ])('parses %s', (_label, input, tz, endOfDay, expected) => {
    expect(parseTaskDateToUTCISO(input, tz, endOfDay)).toBe(expected);
  });

  it('throws a RangeError for an unparseable naive string', () => {
    expect(() => parseTaskDateToUTCISO('not a date', 'UTC', false)).toThrow(
      RangeError
    );
  });
});
