import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateDuration,
  compareTimetz,
  formatTimezoneOffset,
  getDateRange,
  getDateRangeOptions,
  getDateRangeUnits,
  maxTimetz,
  minTimetz,
  parseTimezoneOffset,
  timetzToHour,
  timetzToTime,
} from '../date-helper';

describe('Date Helper', () => {
  describe('timetzToTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set system time to a fixed date to control timezone offset
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('converts timetz to local time format', () => {
      // This will depend on the user's timezone offset
      const result = timetzToTime('10:00:00+00');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('handles negative offsets', () => {
      const result = timetzToTime('10:00:00-05');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('handles positive offsets', () => {
      const result = timetzToTime('10:00:00+07');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('handles times with minutes', () => {
      const result = timetzToTime('14:30:00+00');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('timetzToHour', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns undefined for undefined input', () => {
      expect(timetzToHour(undefined)).toBeUndefined();
    });

    it('extracts hour from timetz string', () => {
      const result = timetzToHour('10:30:00+00');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(24);
    });
  });

  describe('compareTimetz', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns negative when first time is earlier', () => {
      const result = compareTimetz('08:00:00+00', '10:00:00+00');
      expect(result).toBeLessThan(0);
    });

    it('returns positive when first time is later', () => {
      const result = compareTimetz('14:00:00+00', '10:00:00+00');
      expect(result).toBeGreaterThan(0);
    });

    it('returns zero for same times', () => {
      const result = compareTimetz('10:00:00+00', '10:00:00+00');
      expect(result).toBe(0);
    });
  });

  describe('minTimetz', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns earlier time', () => {
      const result = minTimetz('08:00:00+00', '10:00:00+00');
      expect(result).toBe('08:00:00+00');
    });

    it('returns first when times are equal', () => {
      const result = minTimetz('10:00:00+00', '10:00:00+00');
      expect(result).toBe('10:00:00+00');
    });
  });

  describe('maxTimetz', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns later time', () => {
      const result = maxTimetz('08:00:00+00', '10:00:00+00');
      expect(result).toBe('10:00:00+00');
    });

    it('returns first when times are equal', () => {
      const result = maxTimetz('10:00:00+00', '10:00:00+00');
      expect(result).toBe('10:00:00+00');
    });
  });

  describe('parseTimezoneOffset', () => {
    it('returns empty string for empty input', () => {
      expect(parseTimezoneOffset('')).toBe('');
    });

    it('parses positive HH:MM offset format', () => {
      expect(parseTimezoneOffset('11:00:00+07:00')).toBe('+07:00');
    });

    it('parses negative HH:MM offset format', () => {
      expect(parseTimezoneOffset('14:30:00-05:30')).toBe('-05:30');
    });

    it('parses positive decimal offset format', () => {
      expect(parseTimezoneOffset('11:00:00+5.5')).toBe('+05:30');
    });

    it('parses negative decimal offset format', () => {
      expect(parseTimezoneOffset('11:00:00-5.5')).toBe('-05:30');
    });

    it('parses simple integer offset', () => {
      expect(parseTimezoneOffset('11:00:00+7')).toBe('+07:00');
    });

    it('parses zero offset', () => {
      expect(parseTimezoneOffset('11:00:00+0')).toBe('+00:00');
    });

    it('returns empty for time without offset', () => {
      expect(parseTimezoneOffset('11:00:00')).toBe('');
    });

    it('handles NaN offset values', () => {
      expect(parseTimezoneOffset('11:00:00+abc')).toBe('');
    });
  });

  describe('formatTimezoneOffset', () => {
    it('returns empty string for empty input', () => {
      expect(formatTimezoneOffset('')).toBe('');
    });

    it('formats positive offset with UTC prefix', () => {
      expect(formatTimezoneOffset('11:00:00+07:00')).toBe('UTC+07:00');
    });

    it('formats negative offset with UTC prefix', () => {
      expect(formatTimezoneOffset('14:30:00-05:30')).toBe('UTC-05:30');
    });

    it('formats decimal offset', () => {
      expect(formatTimezoneOffset('11:00:00+5.5')).toBe('UTC+05:30');
    });

    it('returns empty for time without offset', () => {
      expect(formatTimezoneOffset('11:00:00')).toBe('');
    });
  });

  describe('getDateRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('day unit', () => {
      it('returns today range for present option', () => {
        const [start, end] = getDateRange('day', 'present');
        expect(start?.getDate()).toBe(15);
        expect(end?.getDate()).toBe(15);
      });

      it('returns yesterday range for past option', () => {
        const [start, end] = getDateRange('day', 'past');
        expect(start?.getDate()).toBe(14);
        expect(end?.getDate()).toBe(14);
      });

      it('returns tomorrow range for future option', () => {
        const [start, end] = getDateRange('day', 'future');
        expect(start?.getDate()).toBe(16);
        expect(end?.getDate()).toBe(16);
      });
    });

    describe('week unit', () => {
      it('returns this week range for present option', () => {
        const [start, end] = getDateRange('week', 'present');
        expect(start).toBeInstanceOf(Date);
        expect(end).toBeInstanceOf(Date);
        expect(end!.getTime()).toBeGreaterThan(start!.getTime());
      });

      it('returns last week range for past option', () => {
        const [start, end] = getDateRange('week', 'past');
        expect(start).toBeInstanceOf(Date);
        expect(end).toBeInstanceOf(Date);
      });

      it('returns next week range for future option', () => {
        const [start, end] = getDateRange('week', 'future');
        expect(start).toBeInstanceOf(Date);
        expect(end).toBeInstanceOf(Date);
      });
    });

    describe('month unit', () => {
      it('returns this month range for present option', () => {
        const [start, end] = getDateRange('month', 'present');
        expect(start?.getMonth()).toBe(5); // June (0-indexed)
        expect(end?.getMonth()).toBe(5);
      });

      it('returns last month range for past option', () => {
        const [start, end] = getDateRange('month', 'past');
        expect(start?.getMonth()).toBe(4); // May
        expect(end?.getMonth()).toBe(4);
      });

      it('returns next month range for future option', () => {
        const [start, end] = getDateRange('month', 'future');
        expect(start?.getMonth()).toBe(6); // July
        expect(end?.getMonth()).toBe(6);
      });
    });

    describe('year unit', () => {
      it('returns this year range for present option', () => {
        const [start, end] = getDateRange('year', 'present');
        expect(start?.getFullYear()).toBe(2024);
        expect(end?.getFullYear()).toBe(2024);
      });

      it('returns last year range for past option', () => {
        const [start, end] = getDateRange('year', 'past');
        expect(start?.getFullYear()).toBe(2023);
        expect(end?.getFullYear()).toBe(2023);
      });

      it('returns next year range for future option', () => {
        const [start, end] = getDateRange('year', 'future');
        expect(start?.getFullYear()).toBe(2025);
        expect(end?.getFullYear()).toBe(2025);
      });
    });

    describe('all unit', () => {
      it('returns null dates for all option', () => {
        const [start, end] = getDateRange('all', 'present');
        expect(start).toBeNull();
        expect(end).toBeNull();
      });
    });

    describe('custom unit', () => {
      it('throws error for custom option', () => {
        expect(() => getDateRange('custom', 'present')).toThrow(
          'Not implemented yet'
        );
      });
    });
  });

  describe('getDateRangeUnits', () => {
    it('returns all date range units', () => {
      const mockT = (key: string) => key;
      const units = getDateRangeUnits(mockT);

      expect(units).toHaveLength(6);
      expect(units.map((u) => u.value)).toEqual([
        'day',
        'week',
        'month',
        'year',
        'all',
        'custom',
      ]);
    });

    it('uses translation function for labels', () => {
      const mockT = (key: string) => `translated_${key}`;
      const units = getDateRangeUnits(mockT);

      expect(units[0]?.label).toBe('translated_date_helper.day');
    });
  });

  describe('getDateRangeOptions', () => {
    const mockT = (key: string) => key;

    it('returns day options', () => {
      const options = getDateRangeOptions('day', mockT);
      expect(options).toHaveLength(3);
      expect(options.map((o) => o.value)).toEqual([
        'present',
        'past',
        'future',
      ]);
    });

    it('returns week options', () => {
      const options = getDateRangeOptions('week', mockT);
      expect(options).toHaveLength(3);
    });

    it('returns month options', () => {
      const options = getDateRangeOptions('month', mockT);
      expect(options).toHaveLength(3);
    });

    it('returns year options', () => {
      const options = getDateRangeOptions('year', mockT);
      expect(options).toHaveLength(3);
    });

    it('returns single option for all unit', () => {
      const options = getDateRangeOptions('all', mockT);
      expect(options).toHaveLength(1);
      expect(options[0]?.value).toBe('present');
    });

    it('returns empty array for custom unit', () => {
      const options = getDateRangeOptions('custom', mockT);
      expect(options).toHaveLength(0);
    });
  });

  describe('calculateDuration', () => {
    it('formats seconds for short durations', () => {
      const start = new Date('2024-01-15T10:00:00');
      const end = new Date('2024-01-15T10:00:30');
      expect(calculateDuration(start, end)).toBe('30 seconds');
    });

    it('formats minutes and seconds', () => {
      const start = new Date('2024-01-15T10:00:00');
      const end = new Date('2024-01-15T10:05:30');
      expect(calculateDuration(start, end)).toBe('5m 30s');
    });

    it('formats hours, minutes, and seconds', () => {
      const start = new Date('2024-01-15T10:00:00');
      const end = new Date('2024-01-15T12:30:45');
      expect(calculateDuration(start, end)).toBe('2h 30m 45s');
    });

    it('handles zero duration', () => {
      const date = new Date('2024-01-15T10:00:00');
      expect(calculateDuration(date, date)).toBe('0 seconds');
    });

    it('handles exactly one minute', () => {
      const start = new Date('2024-01-15T10:00:00');
      const end = new Date('2024-01-15T10:01:00');
      expect(calculateDuration(start, end)).toBe('1m 0s');
    });

    it('handles exactly one hour', () => {
      const start = new Date('2024-01-15T10:00:00');
      const end = new Date('2024-01-15T11:00:00');
      expect(calculateDuration(start, end)).toBe('1h 0m 0s');
    });
  });
});
