import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDaysUntilEndOfWeek,
  getNextWeekEndDate,
  getThisWeekEndDate,
} from '../weekDateUtils';

describe('weekDateUtils', () => {
  describe('calculateDaysUntilEndOfWeek', () => {
    const testCases = [
      // weekStartsOn = 0 (Sunday) → end of week = Saturday (6)
      { weekStartsOn: 0 as const, currentDay: 0, expected: 6 }, // Sunday → 6 days to Saturday
      { weekStartsOn: 0 as const, currentDay: 1, expected: 5 }, // Monday → 5 days to Saturday
      { weekStartsOn: 0 as const, currentDay: 2, expected: 4 }, // Tuesday → 4 days to Saturday
      { weekStartsOn: 0 as const, currentDay: 3, expected: 3 }, // Wednesday → 3 days to Saturday
      { weekStartsOn: 0 as const, currentDay: 4, expected: 2 }, // Thursday → 2 days to Saturday
      { weekStartsOn: 0 as const, currentDay: 5, expected: 1 }, // Friday → 1 day to Saturday
      { weekStartsOn: 0 as const, currentDay: 6, expected: 0 }, // Saturday → 0 days (today)

      // weekStartsOn = 1 (Monday) → end of week = Sunday (0)
      { weekStartsOn: 1 as const, currentDay: 0, expected: 0 }, // Sunday → 0 days (today)
      { weekStartsOn: 1 as const, currentDay: 1, expected: 6 }, // Monday → 6 days to Sunday
      { weekStartsOn: 1 as const, currentDay: 2, expected: 5 }, // Tuesday → 5 days to Sunday
      { weekStartsOn: 1 as const, currentDay: 3, expected: 4 }, // Wednesday → 4 days to Sunday
      { weekStartsOn: 1 as const, currentDay: 4, expected: 3 }, // Thursday → 3 days to Sunday
      { weekStartsOn: 1 as const, currentDay: 5, expected: 2 }, // Friday → 2 days to Sunday
      { weekStartsOn: 1 as const, currentDay: 6, expected: 1 }, // Saturday → 1 day to Sunday

      // weekStartsOn = 6 (Saturday) → end of week = Friday (5)
      { weekStartsOn: 6 as const, currentDay: 0, expected: 5 }, // Sunday → 5 days to Friday
      { weekStartsOn: 6 as const, currentDay: 1, expected: 4 }, // Monday → 4 days to Friday
      { weekStartsOn: 6 as const, currentDay: 2, expected: 3 }, // Tuesday → 3 days to Friday
      { weekStartsOn: 6 as const, currentDay: 3, expected: 2 }, // Wednesday → 2 days to Friday
      { weekStartsOn: 6 as const, currentDay: 4, expected: 1 }, // Thursday → 1 day to Friday
      { weekStartsOn: 6 as const, currentDay: 5, expected: 0 }, // Friday → 0 days (today)
      { weekStartsOn: 6 as const, currentDay: 6, expected: 6 }, // Saturday → 6 days to Friday
    ];

    // Mock dates for each test
    testCases.forEach(({ weekStartsOn, currentDay, expected }) => {
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const weekStartNames: Record<0 | 1 | 6, string> = {
        0: 'Sunday',
        1: 'Monday',
        6: 'Saturday',
      };
      const endOfWeekDay = (weekStartsOn - 1 + 7) % 7;

      it(`when weekStartsOn=${weekStartNames[weekStartsOn]}, on ${dayNames[currentDay]}, returns ${expected} days until ${dayNames[endOfWeekDay]}`, () => {
        // Mock dayjs to return a specific day
        // We need to use a date that falls on the currentDay
        // Jan 5, 2025 is a Sunday (0)
        const baseSunday = new Date(2025, 0, 5); // Sunday Jan 5, 2025
        const testDate = new Date(baseSunday);
        testDate.setDate(baseSunday.getDate() + currentDay);

        vi.useFakeTimers();
        vi.setSystemTime(testDate);

        const result = calculateDaysUntilEndOfWeek(weekStartsOn);
        expect(result).toBe(expected);

        vi.useRealTimers();
      });
    });

    it('defaults to weekStartsOn=0 (Sunday) when no argument provided', () => {
      // Set to Wednesday
      const wednesday = new Date(2025, 0, 8); // Wednesday Jan 8, 2025
      vi.useFakeTimers();
      vi.setSystemTime(wednesday);

      const result = calculateDaysUntilEndOfWeek();
      // Wednesday → Saturday = 3 days
      expect(result).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('getThisWeekEndDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns end of Saturday when weekStartsOn=Sunday', () => {
      // Wednesday Jan 8, 2025
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const result = getThisWeekEndDate(0);

      // Should be Saturday Jan 11, 2025 at end of day
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(11);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });

    it('returns end of Sunday when weekStartsOn=Monday', () => {
      // Wednesday Jan 8, 2025
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const result = getThisWeekEndDate(1);

      // Should be Sunday Jan 12, 2025 at end of day
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(12);
    });

    it('returns end of Friday when weekStartsOn=Saturday', () => {
      // Wednesday Jan 8, 2025
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const result = getThisWeekEndDate(6);

      // Should be Friday Jan 10, 2025 at end of day
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(10);
    });
  });

  describe('getNextWeekEndDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns end of next Saturday when weekStartsOn=Sunday', () => {
      // Wednesday Jan 8, 2025
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const result = getNextWeekEndDate(0);

      // This week ends Saturday Jan 11, next week ends Saturday Jan 18
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(18);
    });

    it('returns end of next Sunday when weekStartsOn=Monday', () => {
      // Wednesday Jan 8, 2025
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const result = getNextWeekEndDate(1);

      // This week ends Sunday Jan 12, next week ends Sunday Jan 19
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(19);
    });

    it('is exactly 7 days after getThisWeekEndDate', () => {
      vi.setSystemTime(new Date(2025, 0, 8, 10, 30));

      const thisWeek = getThisWeekEndDate(1);
      const nextWeek = getNextWeekEndDate(1);

      const diffMs = nextWeek.getTime() - thisWeek.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      expect(diffDays).toBe(7);
    });
  });
});
