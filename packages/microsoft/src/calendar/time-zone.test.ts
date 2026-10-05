import { describe, expect, it } from 'vitest';
import { microsoftCalendarTimeZone } from './time-zone';

describe('Graph authoritative recurrence time zones', () => {
  it.each([
    ['Eastern Standard Time', 'America/New_York'],
    ['Pacific Standard Time', 'America/Los_Angeles'],
    ['SE Asia Standard Time', 'Asia/Bangkok'],
    ['UTC', 'UTC'],
    ['America/New_York', 'America/New_York'],
  ])(
    'maps %s through CLDR default territory without guessing an offset',
    (input, expected) => {
      expect(microsoftCalendarTimeZone(input)).toBe(expected);
    }
  );
  it.each(['tzone://Microsoft/Custom', 'Unknown Standard Time', ''])(
    'rejects unsupported custom name %s',
    (input) => {
      expect(() => microsoftCalendarTimeZone(input)).toThrow('Unsupported');
    }
  );
});
