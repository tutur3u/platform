import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateWithTime,
  formatSmartDate,
  getRelativeTimeDisplay,
  isFutureDate,
  isOverdue,
  parseDateSafely,
} from '../taskDateUtils';

describe('taskDateUtils', () => {
  describe('formatSmartDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "Today" for current date', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      expect(formatSmartDate(today)).toBe('Today');
    });

    it('should return "Tomorrow" for next day', () => {
      const tomorrow = new Date('2024-06-16T10:00:00Z');
      expect(formatSmartDate(tomorrow)).toBe('Tomorrow');
    });

    it('should return "Yesterday" for previous day', () => {
      const yesterday = new Date('2024-06-14T10:00:00Z');
      expect(formatSmartDate(yesterday)).toBe('Yesterday');
    });

    it('should return relative time for other dates', () => {
      const futureDate = new Date('2024-06-20T10:00:00Z');
      const result = formatSmartDate(futureDate);
      expect(result).toContain('in');
    });

    it('should return relative time for past dates', () => {
      const pastDate = new Date('2024-06-10T10:00:00Z');
      const result = formatSmartDate(pastDate);
      expect(result).toContain('ago');
    });
  });

  describe('formatDateWithTime', () => {
    it('should format date with time correctly', () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const result = formatDateWithTime(date);
      // Format: "MMM dd 'at' h:mm a"
      expect(result).toMatch(/Jun \d{2} at \d{1,2}:\d{2} (AM|PM)/);
    });

    it('should handle midnight', () => {
      const date = new Date('2024-06-15T00:00:00Z');
      const result = formatDateWithTime(date);
      expect(result).toMatch(/at \d{1,2}:\d{2} (AM|PM)/);
    });

    it('should handle noon', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const result = formatDateWithTime(date);
      expect(result).toMatch(/at \d{1,2}:\d{2} (AM|PM)/);
    });
  });

  describe('isOverdue', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true for past Date object', () => {
      const pastDate = new Date('2024-06-14T12:00:00Z');
      expect(isOverdue(pastDate)).toBe(true);
    });

    it('should return true for past date string', () => {
      expect(isOverdue('2024-06-14T12:00:00Z')).toBe(true);
    });

    it('should return false for future Date object', () => {
      const futureDate = new Date('2024-06-16T12:00:00Z');
      expect(isOverdue(futureDate)).toBe(false);
    });

    it('should return false for future date string', () => {
      expect(isOverdue('2024-06-16T12:00:00Z')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isOverdue(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isOverdue(undefined)).toBe(false);
    });
  });

  describe('isFutureDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true for future Date object', () => {
      const futureDate = new Date('2024-06-16T12:00:00Z');
      expect(isFutureDate(futureDate)).toBe(true);
    });

    it('should return true for future date string', () => {
      expect(isFutureDate('2024-06-16T12:00:00Z')).toBe(true);
    });

    it('should return false for past Date object', () => {
      const pastDate = new Date('2024-06-14T12:00:00Z');
      expect(isFutureDate(pastDate)).toBe(false);
    });

    it('should return false for past date string', () => {
      expect(isFutureDate('2024-06-14T12:00:00Z')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isFutureDate(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isFutureDate(undefined)).toBe(false);
    });
  });

  describe('getRelativeTimeDisplay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return relative time for Date object', () => {
      const futureDate = new Date('2024-06-20T12:00:00Z');
      const result = getRelativeTimeDisplay(futureDate);
      expect(result).toContain('in');
    });

    it('should return relative time for date string', () => {
      const result = getRelativeTimeDisplay('2024-06-10T12:00:00Z');
      expect(result).toContain('ago');
    });

    it('should return null for null input', () => {
      expect(getRelativeTimeDisplay(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(getRelativeTimeDisplay(undefined)).toBeNull();
    });

    it('should include suffix in result', () => {
      const result = getRelativeTimeDisplay('2024-06-10T12:00:00Z');
      expect(result).toMatch(/(ago|in)/);
    });
  });

  describe('parseDateSafely', () => {
    it('should parse valid Date object', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const result = parseDateSafely(date);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(date.getTime());
    });

    it('should parse valid date string', () => {
      const result = parseDateSafely('2024-06-15T12:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2024-06-15T12:00:00.000Z');
    });

    it('should parse ISO date strings', () => {
      const result = parseDateSafely('2024-06-15');
      expect(result).toBeInstanceOf(Date);
    });

    it('should return null for null input', () => {
      expect(parseDateSafely(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(parseDateSafely(undefined)).toBeNull();
    });

    it('should return null for invalid date string', () => {
      expect(parseDateSafely('not-a-date')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseDateSafely('')).toBeNull();
    });

    it('should handle timestamp strings', () => {
      const timestamp = '1718451600000';
      // This might parse as NaN depending on implementation
      const result = parseDateSafely(timestamp);
      // Either null or valid date is acceptable
      if (result !== null) {
        expect(result).toBeInstanceOf(Date);
        expect(Number.isNaN(result.getTime())).toBe(false);
      }
    });
  });
});
