import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatTimezoneOffset, parseTimezoneOffset } from '../date-helper';
import {
  buildDateInTimezone,
  formatInTimezone,
  getDatePartsInTimezone,
  parseTaskDateToUTCISO,
} from '../task-date-timezone';
import { parseTimeFromTimetz } from '../time-helper';
import {
  getTimezoneOffset,
  isValidTimezone,
  resolveAutoTimezone,
} from '../timezone';

const properties = { seed: 20261031, numRuns: 200 };

const fixedOffsetZones = [
  ['UTC', '+00:00'],
  ['Asia/Ho_Chi_Minh', '+07:00'],
  ['Asia/Kolkata', '+05:30'],
  ['Asia/Kathmandu', '+05:45'],
  ['Asia/Tokyo', '+09:00'],
] as const;
const fixedZone = fc.constantFrom(...fixedOffsetZones);
const dstZone = fc.constantFrom(
  'America/New_York',
  'Europe/London',
  'Australia/Lord_Howe',
  'Pacific/Auckland'
);
const anyZone = fc.constantFrom(
  ...(
    Intl as unknown as { supportedValuesOf: (key: string) => string[] }
  ).supportedValuesOf('timeZone')
);
const instant = fc.date({
  min: new Date('1971-01-01T00:00:00Z'),
  max: new Date('2099-12-31T23:59:59Z'),
  noInvalidDate: true,
});
const modernInstant = fc.date({
  min: new Date('2000-01-01T00:00:00Z'),
  max: new Date('2099-12-31T23:59:59Z'),
  noInvalidDate: true,
});
const modernParts = fc.record({
  year: fc.integer({ min: 2000, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
});
const localParts = fc.record({
  year: fc.integer({ min: 1971, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
});
const pad = (value: number, width = 2) => String(value).padStart(width, '0');

describe('timezone resolution properties', () => {
  it('resolveAutoTimezone returns a valid IANA identifier for any string input', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        (input) => {
          expect(isValidTimezone(resolveAutoTimezone(input))).toBe(true);
        }
      ),
      properties
    );
  });

  it('resolveAutoTimezone is idempotent', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), anyZone, fc.constant('auto')),
        (input) => {
          const once = resolveAutoTimezone(input);
          expect(resolveAutoTimezone(once)).toBe(once);
        }
      ),
      properties
    );
  });

  it('resolveAutoTimezone returns every supported zone unchanged', () => {
    fc.assert(
      fc.property(anyZone, (zone) => {
        expect(resolveAutoTimezone(zone)).toBe(zone);
      }),
      properties
    );
  });
});

describe('timezone offset properties', () => {
  it('getTimezoneOffset is always signed HH:MM within -12:00 and +14:00 for any zone and instant', () => {
    fc.assert(
      fc.property(anyZone, instant, (zone, at) => {
        const offset = getTimezoneOffset(zone, at);
        expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
        const sign = offset.startsWith('-') ? -1 : 1;
        const minutes =
          sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
        expect(minutes).toBeGreaterThanOrEqual(-12 * 60);
        expect(minutes).toBeLessThanOrEqual(14 * 60);
      }),
      properties
    );
  });

  it('getTimezoneOffset is constant over time for zones without daylight saving', () => {
    fc.assert(
      fc.property(fixedZone, modernInstant, ([zone, expected], at) => {
        expect(getTimezoneOffset(zone, at)).toBe(expected);
      }),
      properties
    );
  });

  it('getTimezoneOffset changes by at most one hour between instants one day apart', () => {
    fc.assert(
      fc.property(anyZone, instant, (zone, at) => {
        const toMinutes = (offset: string) =>
          (offset.startsWith('-') ? -1 : 1) *
          (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
        const next = new Date(at.getTime() + 24 * 60 * 60 * 1000);
        const shift = Math.abs(
          toMinutes(getTimezoneOffset(zone, next)) -
            toMinutes(getTimezoneOffset(zone, at))
        );
        expect(shift).toBeLessThanOrEqual(60);
      }),
      properties
    );
  });

  it('parseTimezoneOffset returns the HH:MM suffix of any timetz string unchanged', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom('+', '-'),
        fc.integer({ min: 0, max: 14 }),
        fc.constantFrom(0, 15, 30, 45),
        (hour, minute, sign, offsetHour, offsetMinute) => {
          const offset = `${sign}${pad(offsetHour)}:${pad(offsetMinute)}`;
          const timetz = `${pad(hour)}:${pad(minute)}:00${offset}`;
          expect(parseTimezoneOffset(timetz)).toBe(offset);
          expect(formatTimezoneOffset(timetz)).toBe(`UTC${offset}`);
        }
      ),
      properties
    );
  });

  it('parseTimeFromTimetz returns undefined or an hour between 1 and 24', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const hour = parseTimeFromTimetz(input);
        if (hour !== undefined) {
          expect(Number.isInteger(hour)).toBe(true);
          expect(hour).toBeGreaterThanOrEqual(1);
          expect(hour).toBeLessThanOrEqual(24);
        }
      }),
      properties
    );
  });

  it('parseTimeFromTimetz maps hour zero to 24 and keeps every other hour', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          expect(parseTimeFromTimetz(`${pad(hour)}:${pad(minute)}:00+00`)).toBe(
            hour === 0 ? 24 : hour
          );
        }
      ),
      properties
    );
  });
});

describe('task date timezone properties', () => {
  it('getDatePartsInTimezone returns the parts buildDateInTimezone was given for zones without daylight saving', () => {
    fc.assert(
      fc.property(fixedZone, modernParts, ([zone], parts) => {
        const built = buildDateInTimezone(
          parts.year,
          parts.month,
          parts.day,
          parts.hour,
          parts.minute,
          zone
        );
        expect(getDatePartsInTimezone(built, zone)).toEqual(parts);
      }),
      properties
    );
  });

  it('buildDateInTimezone shifts the instant by exactly the zone offset for zones without daylight saving', () => {
    fc.assert(
      fc.property(fixedZone, modernParts, ([zone, offset], parts) => {
        const built = buildDateInTimezone(
          parts.year,
          parts.month,
          parts.day,
          parts.hour,
          parts.minute,
          zone
        );
        const wallClockAsUtc = Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          parts.hour,
          parts.minute
        );
        const sign = offset.startsWith('-') ? -1 : 1;
        const offsetMs =
          sign *
          (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) *
          60_000;
        expect(built.getTime()).toBe(wallClockAsUtc - offsetMs);
      }),
      properties
    );
  });

  it('formatInTimezone reproduces the local parts given to buildDateInTimezone for zones without daylight saving', () => {
    fc.assert(
      fc.property(fixedZone, modernParts, ([zone], parts) => {
        const built = buildDateInTimezone(
          parts.year,
          parts.month,
          parts.day,
          parts.hour,
          parts.minute,
          zone
        );
        expect(formatInTimezone(built, zone, 'YYYY-MM-DD HH:mm')).toBe(
          `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`
        );
      }),
      properties
    );
  });

  it('rebuilding an instant from its local parts returns the same minute in daylight-saving zones at midday', () => {
    fc.assert(
      fc.property(dstZone, instant, (zone, at) => {
        const parts = getDatePartsInTimezone(at, zone);
        const noon = buildDateInTimezone(
          parts.year,
          parts.month,
          parts.day,
          12,
          0,
          zone
        );
        const noonParts = getDatePartsInTimezone(noon, zone);
        expect(noonParts).toEqual({
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: 12,
          minute: 0,
        });
      }),
      properties
    );
  });

  it('parseTaskDateToUTCISO places start of day at or before end of day for the same date and zone', () => {
    fc.assert(
      fc.property(anyZone, localParts, (zone, parts) => {
        const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
        const start = parseTaskDateToUTCISO(date, zone, false);
        const end = parseTaskDateToUTCISO(date, zone, true);
        expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
        expect(
          new Date(end).getTime() - new Date(start).getTime()
        ).toBeLessThan(25 * 60 * 60 * 1000);
      }),
      properties
    );
  });

  it('parseTaskDateToUTCISO ignores the configured zone when the input carries an explicit offset', () => {
    fc.assert(
      fc.property(anyZone, anyZone, instant, (left, right, at) => {
        const iso = at.toISOString();
        expect(parseTaskDateToUTCISO(iso, left, false)).toBe(iso);
        expect(parseTaskDateToUTCISO(iso, right, true)).toBe(iso);
      }),
      properties
    );
  });

  it('parseTaskDateToUTCISO output is always a parseable ISO instant for date-only input', () => {
    fc.assert(
      fc.property(
        anyZone,
        localParts,
        fc.boolean(),
        (zone, parts, endOfDay) => {
          const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
          const out = parseTaskDateToUTCISO(date, zone, endOfDay);
          expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
          expect(Number.isNaN(new Date(out).getTime())).toBe(false);
        }
      ),
      properties
    );
  });
});
